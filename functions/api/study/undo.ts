import { and, desc, eq } from "drizzle-orm";

import type { Env } from "../../_lib/env";
import { handle, json, notFound } from "../../_lib/http";
import { reviewLogs } from "../../_lib/schema";
import { openSession } from "../../_lib/session";
import { rebuildCardState } from "../../_lib/study";
import { masteryPercent } from "../../_lib/srs";

/**
 * 直前のレビューを 1 件取り消す。
 * ログを消してから、そのカードの状態を残りのログから作り直すだけでよい。
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { db, user } = await openSession(request, env);

    const [last] = await db
      .select({ id: reviewLogs.id, cardId: reviewLogs.cardId })
      .from(reviewLogs)
      .where(eq(reviewLogs.userId, user.id))
      .orderBy(desc(reviewLogs.reviewedAt))
      .limit(1);

    if (!last) throw notFound("取り消せるレビューがありません");

    await db.delete(reviewLogs).where(and(eq(reviewLogs.userId, user.id), eq(reviewLogs.id, last.id)));
    const restored = await rebuildCardState(db, user, last.cardId);

    return json({
      cardId: last.cardId,
      state: restored.state,
      due: restored.due,
      mastery: masteryPercent(restored.stability),
    });
  });
