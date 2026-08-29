import { and, desc, eq, lte, ne, sql } from "drizzle-orm";

import type { Env } from "../../_lib/env";
import { handle, json } from "../../_lib/http";
import { cardStates, reviewLogs } from "../../_lib/schema";
import { openSession } from "../../_lib/session";
import { masteryPercent, studyDay } from "../../_lib/srs";
import { dailyCounts } from "../../_lib/study";

/** 連続学習日数。ロールオーバー済みの study_day を新しい順にたどるだけ */
function streakFrom(days: string[], today: string, yesterday: string): number {
  if (days.length === 0) return 0;

  const first = days[0];
  if (first !== today && first !== yesterday) return 0;

  let streak = 1;
  let cursor = new Date(`${first}T00:00:00Z`).getTime();

  for (const day of days.slice(1)) {
    const previous = new Date(cursor - 86_400_000).toISOString().slice(0, 10);
    if (day !== previous) break;
    streak += 1;
    cursor = new Date(`${day}T00:00:00Z`).getTime();
  }

  return streak;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { db, user } = await openSession(request, env);
    const { settings } = user;

    const now = Date.now();
    const today = studyDay(now, settings.timezone, settings.dayStartHour);
    const yesterday = studyDay(now - 86_400_000, settings.timezone, settings.dayStartHour);

    const counts = await dailyCounts(db, user.id, today);

    const [dueRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(cardStates)
      .where(
        and(
          eq(cardStates.userId, user.id),
          eq(cardStates.suspended, 0),
          ne(cardStates.state, "new"),
          lte(cardStates.due, now),
        ),
      );

    const byState = await db
      .select({ state: cardStates.state, count: sql<number>`count(*)` })
      .from(cardStates)
      .where(eq(cardStates.userId, user.id))
      .groupBy(cardStates.state);

    // 暗記度の分布はカード数が高々数百なので、素直に取って JS で刻む
    const stabilities = await db
      .select({ stability: cardStates.stability })
      .from(cardStates)
      .where(and(eq(cardStates.userId, user.id), ne(cardStates.state, "new")));

    const buckets = [0, 0, 0, 0, 0];
    for (const row of stabilities) {
      const index = Math.min(Math.floor(masteryPercent(row.stability) / 20), 4);
      buckets[index] = (buckets[index] ?? 0) + 1;
    }

    const days = await db
      .selectDistinct({ day: reviewLogs.studyDay })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, user.id))
      .orderBy(desc(reviewLogs.studyDay))
      .limit(365);

    return json({
      studyDay: today,
      done: { new: counts.newDone, review: counts.reviewDone },
      remaining: {
        new: Math.max(settings.newPerDay - counts.newDone, 0),
        review: Math.max(settings.reviewsPerDay - counts.reviewDone, 0),
      },
      dueNow: Number(dueRow?.count ?? 0),
      byState: Object.fromEntries(byState.map((row) => [row.state, Number(row.count)])),
      masteryBuckets: buckets,
      streak: streakFrom(
        days.map((row) => row.day),
        today,
        yesterday,
      ),
    });
  });
