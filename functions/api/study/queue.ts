import type { Env } from "../../_lib/env";
import { handle, json } from "../../_lib/http";
import { openSession } from "../../_lib/session";
import { buildQueue, ensureCardStates } from "../../_lib/study";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { db, user } = await openSession(request, env);

    const requested = Number(new URL(request.url).searchParams.get("limit"));
    const limit = Number.isFinite(requested)
      ? Math.min(Math.max(Math.trunc(requested), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;

    const now = Date.now();
    await ensureCardStates(db, user.id, now);
    const queue = await buildQueue(db, user, now, limit);

    return json({
      studyDay: queue.day,
      done: { new: queue.counts.newDone, review: queue.counts.reviewDone },
      remaining: { new: queue.remaining.newDone, review: queue.remaining.reviewDone },
      cards: queue.cards,
    });
  });
