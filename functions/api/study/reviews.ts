import type { Env } from "../../_lib/env";
import { handle, json, readJson } from "../../_lib/http";
import { openSession } from "../../_lib/session";
import { applyReviews, dailyCounts, parseReviews } from "../../_lib/study";
import { studyDay } from "../../_lib/srs";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { db, user } = await openSession(request, env);
    const reviews = parseReviews(await readJson(request));

    const { applied, skipped } = await applyReviews(db, user, reviews);

    const { settings } = user;
    const day = studyDay(Date.now(), settings.timezone, settings.dayStartHour);
    const counts = await dailyCounts(db, user.id, day);

    return json({
      studyDay: day,
      applied,
      // 既に受け付け済みだったぶん。オフラインからの再送で普通に起きる
      skipped,
      done: { new: counts.newDone, review: counts.reviewDone },
      remaining: {
        new: Math.max(settings.newPerDay - counts.newDone, 0),
        review: Math.max(settings.reviewsPerDay - counts.reviewDone, 0),
      },
    });
  });
