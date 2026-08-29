/**
 * FSRS まわりの純粋関数。DB には触らない。
 * サーバ側の計算を正とし、クライアントは同じ関数で楽観的に先行表示するだけ。
 */
import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRS,
  type Grade,
  type StepUnit,
} from "ts-fsrs";

import type { CardStateRow, UserSettingsRow } from "./schema";

export type StateName = "new" | "learning" | "review" | "relearning";

/** 左スワイプ = 覚えていない / 右スワイプ = 覚えている */
export const SWIPE_TO_RATING = {
  left: Rating.Again,
  right: Rating.Good,
} as const;

const STATE_NAMES: readonly StateName[] = ["new", "learning", "review", "relearning"];

export function stateName(state: State): StateName {
  return STATE_NAMES[state] ?? "new";
}

export function stateValue(name: string): State {
  const index = STATE_NAMES.indexOf(name as StateName);
  return index >= 0 ? (index as State) : State.New;
}

export function isGrade(rating: number): rating is Grade {
  return rating === Rating.Again || rating === Rating.Hard || rating === Rating.Good || rating === Rating.Easy;
}

/**
 * ロールオーバーを適用した「学習日」を YYYY-MM-DD で返す。
 *
 * SQLite にタイムゾーン付きの時刻型がないので、この計算はアプリ側の責務。
 * 書き込み時に review_logs.study_day へ入れておくことで、日次の集計が索引一発になる。
 */
export function studyDay(atMs: number, timezone: string, dayStartHour: number): string {
  const shifted = new Date(atMs - dayStartHour * 3_600_000);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

/**
 * 暗記度: 安定度 S(日) を対数で 0〜100 に写像する。S = 365 日 でちょうど 100。
 * S をそのまま出すと 40 日と 200 日の差が伝わりにくいため。
 */
export function masteryPercent(stability: number | null): number {
  if (!stability || stability <= 0) return 0;
  return Math.round(100 * Math.min(1, Math.log1p(stability) / Math.log1p(365)));
}

function parseSteps(raw: string, fallback: StepUnit[]): StepUnit[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((step) => typeof step === "string")) {
      return parsed as StepUnit[];
    }
  } catch {
    // 壊れていたら既定値で続ける。学習を止めるほどの話ではない
  }
  return fallback;
}

function parseParams(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((value) => typeof value === "number")) {
      return parsed as number[];
    }
  } catch {
    // 同上。既定パラメータにフォールバックする
  }
  return undefined;
}

export function schedulerFor(settings: UserSettingsRow): FSRS {
  const w = parseParams(settings.fsrsParams);

  return fsrs(
    generatorParameters({
      request_retention: settings.desiredRetention,
      maximum_interval: settings.maxIntervalDays,
      ...(w ? { w } : {}),
      // 復習日を数%ばらけさせ、同じ日に取り込んだノートが毎回まとまって出るのを防ぐ
      enable_fuzz: true,
      enable_short_term: true,
      learning_steps: parseSteps(settings.learningSteps, ["1m", "10m"]),
      relearning_steps: parseSteps(settings.relearningSteps, ["10m"]),
    }),
  );
}

export function toFsrsCard(row: Pick<
  CardStateRow,
  "state" | "stability" | "difficulty" | "due" | "lastReview" | "scheduledDays" | "elapsedDays" | "learningSteps" | "reps" | "lapses"
> | null): Card {
  if (!row || row.state === "new") return createEmptyCard();

  return {
    due: new Date(row.due),
    stability: row.stability ?? 0,
    difficulty: row.difficulty ?? 0,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: stateValue(row.state),
    ...(row.lastReview ? { last_review: new Date(row.lastReview) } : {}),
  };
}

export interface PersistableCard {
  state: StateName;
  stability: number;
  difficulty: number;
  due: number;
  lastReview: number | null;
  scheduledDays: number;
  elapsedDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
}

export function fromFsrsCard(card: Card): PersistableCard {
  return {
    state: stateName(card.state),
    stability: card.stability,
    difficulty: card.difficulty,
    due: card.due.getTime(),
    lastReview: card.last_review ? card.last_review.getTime() : null,
    scheduledDays: card.scheduled_days,
    elapsedDays: card.elapsed_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
  };
}

/** いま出題したときの想起確率。カードに「思い出しやすさ」を出すのに使う */
export function retrievabilityOf(scheduler: FSRS, card: Card, atMs: number): number {
  return scheduler.get_retrievability(card, atMs, false);
}
