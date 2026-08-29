/**
 * 学習まわりの DB 操作。
 *
 * 方針: review_logs が原本で、card_states はそこから作り直せる派生データ。
 * この前提のおかげで、オフライン同期の順序ずれ・Undo・パラメータ再最適化が
 * すべて rebuildCardState() ひとつに帰着する。
 */
import { and, asc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { Grade } from "ts-fsrs";

import type { Db } from "./db";
import type { AccessIdentity } from "./access";
import { badRequest } from "./http";
import { cardStates, cards, notes, reviewLogs, userSettings, users } from "./schema";
import type { UserSettingsRow } from "./schema";
import {
  fromFsrsCard,
  isGrade,
  masteryPercent,
  retrievabilityOf,
  schedulerFor,
  studyDay,
  toFsrsCard,
} from "./srs";

export interface SessionUser {
  id: string;
  email: string;
  settings: UserSettingsRow;
}

/** 初回アクセスがそのまま登録になる。サインアップ画面は存在しない */
export async function currentUser(db: Db, identity: AccessIdentity): Promise<SessionUser> {
  const now = Date.now();

  const [user] = await db
    .insert(users)
    .values({ id: crypto.randomUUID(), accessSub: identity.sub, email: identity.email, createdAt: now })
    .onConflictDoUpdate({ target: users.accessSub, set: { email: identity.email } })
    .returning();

  if (!user) throw new Error("ユーザー行を作成できませんでした");

  const [existing] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);

  if (existing) return { id: user.id, email: user.email, settings: existing };

  const [created] = await db
    .insert(userSettings)
    .values({ userId: user.id, updatedAt: now })
    .onConflictDoNothing()
    .returning();

  if (created) return { id: user.id, email: user.email, settings: created };

  // 同時実行で先を越された場合。読み直せば必ずある
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, user.id))
    .limit(1);
  if (!settings) throw new Error("設定行を作成できませんでした");

  return { id: user.id, email: user.email, settings };
}

/**
 * まだ card_states を持っていないカードに 'new' の行を用意する。
 * 同期ジョブはユーザーを知らないので、ここで遅延生成する。
 * 通常は 0 件で、ノートが増えた直後だけ数行動く。
 */
export async function ensureCardStates(db: Db, userId: string, now: number): Promise<void> {
  await db.run(sql`
    INSERT INTO card_states (user_id, card_id, state, due, updated_at)
    SELECT ${userId}, c.id, 'new', ${now}, ${now}
    FROM cards c
    WHERE c.retired_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM card_states cs WHERE cs.user_id = ${userId} AND cs.card_id = c.id
      )
  `);
}

export interface DailyCounts {
  newDone: number;
  reviewDone: number;
}

export async function dailyCounts(db: Db, userId: string, day: string): Promise<DailyCounts> {
  const [row] = await db
    .select({
      newDone: sql<number>`coalesce(sum(case when ${reviewLogs.stateBefore} = 'new' then 1 else 0 end), 0)`,
      reviewDone: sql<number>`coalesce(sum(case when ${reviewLogs.stateBefore} <> 'new' then 1 else 0 end), 0)`,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.studyDay, day)));

  return { newDone: Number(row?.newDone ?? 0), reviewDone: Number(row?.reviewDone ?? 0) };
}

export interface QueueCard {
  cardId: string;
  noteId: string;
  kind: string;
  front: string;
  title: string;
  category: string;
  state: string;
  due: number;
  mastery: number;
  retrievability: number;
  isNew: boolean;
}

export async function buildQueue(
  db: Db,
  user: SessionUser,
  now: number,
  limit: number,
): Promise<{ cards: QueueCard[]; counts: DailyCounts; remaining: DailyCounts; day: string }> {
  const { settings } = user;
  const day = studyDay(now, settings.timezone, settings.dayStartHour);
  const counts = await dailyCounts(db, user.id, day);

  const reviewLeft = Math.max(settings.reviewsPerDay - counts.reviewDone, 0);
  const newLeft = Math.max(settings.newPerDay - counts.newDone, 0);

  const selection = {
    cardId: cardStates.cardId,
    noteId: cards.noteId,
    kind: cards.kind,
    front: cards.front,
    title: notes.title,
    category: notes.category,
    state: cardStates.state,
    due: cardStates.due,
    stability: cardStates.stability,
    difficulty: cardStates.difficulty,
    lastReview: cardStates.lastReview,
    scheduledDays: cardStates.scheduledDays,
    elapsedDays: cardStates.elapsedDays,
    learningSteps: cardStates.learningSteps,
    reps: cardStates.reps,
    lapses: cardStates.lapses,
  };

  const dueRows = reviewLeft
    ? await db
        .select(selection)
        .from(cardStates)
        .innerJoin(cards, eq(cards.id, cardStates.cardId))
        .innerJoin(notes, eq(notes.id, cards.noteId))
        .where(
          and(
            eq(cardStates.userId, user.id),
            eq(cardStates.suspended, 0),
            ne(cardStates.state, "new"),
            lte(cardStates.due, now),
            isNull(cards.retiredAt),
          ),
        )
        .orderBy(asc(cardStates.due))
        .limit(Math.min(reviewLeft, limit))
    : [];

  const newSlots = Math.min(newLeft, Math.max(limit - dueRows.length, 0));
  const newRows = newSlots
    ? await db
        .select(selection)
        .from(cardStates)
        .innerJoin(cards, eq(cards.id, cardStates.cardId))
        .innerJoin(notes, eq(notes.id, cards.noteId))
        .where(
          and(
            eq(cardStates.userId, user.id),
            eq(cardStates.suspended, 0),
            eq(cardStates.state, "new"),
            isNull(cards.retiredAt),
          ),
        )
        .orderBy(sql`random()`)
        .limit(newSlots)
    : [];

  const scheduler = schedulerFor(settings);
  const toQueueCard = (row: (typeof dueRows)[number]): QueueCard => ({
    cardId: row.cardId,
    noteId: row.noteId,
    kind: row.kind,
    front: row.front,
    title: row.title,
    category: row.category,
    state: row.state,
    due: row.due,
    mastery: masteryPercent(row.stability),
    retrievability: row.state === "new" ? 0 : retrievabilityOf(scheduler, toFsrsCard(row), now),
    isNew: row.state === "new",
  });

  return {
    cards: [...dueRows, ...newRows].map(toQueueCard),
    counts,
    // 「今日あと何枚やれるか」。手元のキューに積んだぶんは差し引かない
    // (/api/study/reviews が返す remaining と同じ意味に揃えてある)
    remaining: { newDone: newLeft, reviewDone: reviewLeft },
    day,
  };
}

export interface ReviewInput {
  clientEventId: string;
  cardId: string;
  rating: number;
  reviewedAt: number;
  durationMs?: number;
}

export interface AppliedState {
  cardId: string;
  state: string;
  due: number;
  mastery: number;
}

const MAX_REVIEWS_PER_REQUEST = 50;

export function parseReviews(payload: unknown): ReviewInput[] {
  const list = (payload as { reviews?: unknown } | null)?.reviews;
  if (!Array.isArray(list) || list.length === 0) {
    throw badRequest("reviews が空です");
  }
  if (list.length > MAX_REVIEWS_PER_REQUEST) {
    // CPU 10ms の枠に収めるため、1 リクエストの件数を区切る
    throw badRequest(`1 回に送れるレビューは ${MAX_REVIEWS_PER_REQUEST} 件までです`);
  }

  return list.map((raw): ReviewInput => {
    const item = raw as Partial<ReviewInput>;
    if (
      typeof item.clientEventId !== "string" ||
      typeof item.cardId !== "string" ||
      typeof item.rating !== "number" ||
      typeof item.reviewedAt !== "number"
    ) {
      throw badRequest("レビューの形式が正しくありません");
    }
    if (!isGrade(item.rating)) {
      throw badRequest("rating は 1〜4 のいずれかです");
    }
    return {
      clientEventId: item.clientEventId,
      cardId: item.cardId,
      rating: item.rating,
      reviewedAt: item.reviewedAt,
      ...(typeof item.durationMs === "number" ? { durationMs: item.durationMs } : {}),
    };
  });
}

/**
 * レビューをまとめて反映する。
 *
 * 冪等性は (user_id, client_event_id) の一意索引で担保する。既知の ID は先に
 * 弾いておき、それでもすり抜けた重複はバッチごと失敗させる。D1 の batch は
 * トランザクションなので、ログだけ入って状態が二重に進む状態にはならない。
 */
export async function applyReviews(
  db: Db,
  user: SessionUser,
  inputs: ReviewInput[],
): Promise<{ applied: AppliedState[]; skipped: string[] }> {
  const { settings } = user;
  const scheduler = schedulerFor(settings);
  const now = Date.now();

  const known = await db
    .select({ clientEventId: reviewLogs.clientEventId })
    .from(reviewLogs)
    .where(
      and(
        eq(reviewLogs.userId, user.id),
        inArray(
          reviewLogs.clientEventId,
          inputs.map((input) => input.clientEventId),
        ),
      ),
    );

  const seen = new Set(known.map((row) => row.clientEventId));
  const fresh = inputs
    .filter((input) => !seen.has(input.clientEventId))
    .sort((a, b) => a.reviewedAt - b.reviewedAt);

  if (fresh.length === 0) {
    return { applied: [], skipped: inputs.map((input) => input.clientEventId) };
  }

  const cardIds = [...new Set(fresh.map((input) => input.cardId))];
  const stateRows = await db
    .select()
    .from(cardStates)
    .where(and(eq(cardStates.userId, user.id), inArray(cardStates.cardId, cardIds)));

  const byCard = new Map(stateRows.map((row) => [row.cardId, row]));
  const statements: BatchItem<"sqlite">[] = [];
  const applied: AppliedState[] = [];
  const needsRebuild = new Set<string>();

  for (const input of fresh) {
    const before = byCard.get(input.cardId);
    if (!before) throw badRequest(`未知のカードです: ${input.cardId}`);

    // 端末側の時計が既存の記録より過去 = オフラインぶんが遅れて届いた。
    // 逐次適用せず、あとでログから作り直す
    if (before.lastReview !== null && input.reviewedAt < before.lastReview) {
      needsRebuild.add(input.cardId);
    }

    const fsrsCard = toFsrsCard(before);
    const { card: after } = scheduler.next(fsrsCard, new Date(input.reviewedAt), input.rating as Grade);
    const next = fromFsrsCard(after);

    statements.push(
      db.insert(reviewLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        cardId: input.cardId,
        clientEventId: input.clientEventId,
        rating: input.rating,
        stateBefore: before.state,
        stabilityBefore: before.stability,
        difficultyBefore: before.difficulty,
        stabilityAfter: next.stability,
        difficultyAfter: next.difficulty,
        elapsedDays: next.elapsedDays,
        scheduledDays: next.scheduledDays,
        durationMs: input.durationMs ?? null,
        reviewedAt: input.reviewedAt,
        studyDay: studyDay(input.reviewedAt, settings.timezone, settings.dayStartHour),
        createdAt: now,
      }),
    );

    statements.push(
      db
        .update(cardStates)
        .set({ ...next, updatedAt: now })
        .where(and(eq(cardStates.userId, user.id), eq(cardStates.cardId, input.cardId))),
    );

    // 同じカードが同一バッチに複数回現れても正しく積み上がるようにする
    byCard.set(input.cardId, { ...before, ...next, updatedAt: now });
    applied.push({
      cardId: input.cardId,
      state: next.state,
      due: next.due,
      mastery: masteryPercent(next.stability),
    });
  }

  await db.batch(statements as [BatchItem<"sqlite">, ...BatchItem<"sqlite">[]]);

  for (const cardId of needsRebuild) {
    const rebuilt = await rebuildCardState(db, user, cardId);
    const entry = applied.find((item) => item.cardId === cardId);
    if (entry && rebuilt) {
      entry.state = rebuilt.state;
      entry.due = rebuilt.due;
      entry.mastery = masteryPercent(rebuilt.stability);
    }
  }

  return { applied, skipped: [...seen] };
}

/**
 * review_logs を時刻順に再生して card_states を作り直す。
 *
 * オフライン同期の順序ずれ・Undo・FSRS パラメータの再最適化が、
 * すべてこの 1 関数に集まる。
 *
 * なお review_logs の *_before / *_after は「計算した時点の記録」なので、
 * 再生時に書き戻さない。原本はあくまで rating と reviewed_at である。
 */
export async function rebuildCardState(db: Db, user: SessionUser, cardId: string) {
  const scheduler = schedulerFor(user.settings);
  const logs = await db
    .select({ rating: reviewLogs.rating, reviewedAt: reviewLogs.reviewedAt })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, user.id), eq(reviewLogs.cardId, cardId)))
    .orderBy(asc(reviewLogs.reviewedAt));

  const now = Date.now();
  let card = toFsrsCard(null);

  for (const log of logs) {
    if (!isGrade(log.rating)) continue;
    ({ card } = scheduler.next(card, new Date(log.reviewedAt), log.rating));
  }

  const next = logs.length
    ? fromFsrsCard(card)
    : {
        state: "new" as const,
        stability: null,
        difficulty: null,
        due: now,
        lastReview: null,
        scheduledDays: 0,
        elapsedDays: 0,
        learningSteps: 0,
        reps: 0,
        lapses: 0,
      };

  await db
    .update(cardStates)
    .set({ ...next, updatedAt: now })
    .where(and(eq(cardStates.userId, user.id), eq(cardStates.cardId, cardId)));

  return next;
}
