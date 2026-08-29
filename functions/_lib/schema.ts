/**
 * Drizzle のスキーマ定義。
 *
 * DDL の正は migrations/*.sql のほうで、ここはそれを写した型定義である。
 * カラムを足すときは必ずマイグレーションを先に書き、こちらを合わせること。
 */
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const notes = sqliteTable("notes", {
  id: text("id").primaryKey(),
  issueNumber: integer("issue_number"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  labels: text("labels").notNull().default("[]"),
  sourceUrl: text("source_url"),
  closedAt: integer("closed_at"),
  contentHash: text("content_hash").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    noteId: text("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["note", "qa", "cloze"] })
      .notNull()
      .default("note"),
    ordinal: integer("ordinal").notNull().default(0),
    front: text("front").notNull(),
    back: text("back").notNull().default(""),
    contentHash: text("content_hash").notNull(),
    contentUpdatedAt: integer("content_updated_at"),
    retiredAt: integer("retired_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("cards_note_kind_ordinal_idx").on(t.noteId, t.kind, t.ordinal),
    index("cards_note_idx").on(t.noteId),
  ],
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  accessSub: text("access_sub").notNull().unique(),
  email: text("email").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone").notNull().default("Asia/Tokyo"),
  dayStartHour: integer("day_start_hour").notNull().default(4),
  desiredRetention: real("desired_retention").notNull().default(0.9),
  newPerDay: integer("new_per_day").notNull().default(5),
  reviewsPerDay: integer("reviews_per_day").notNull().default(60),
  maxIntervalDays: integer("max_interval_days").notNull().default(365),
  learningSteps: text("learning_steps").notNull().default('["1m","10m"]'),
  relearningSteps: text("relearning_steps").notNull().default('["10m"]'),
  fsrsParams: text("fsrs_params"),
  updatedAt: integer("updated_at").notNull(),
});

export const cardStates = sqliteTable(
  "card_states",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    state: text("state", { enum: ["new", "learning", "review", "relearning"] })
      .notNull()
      .default("new"),
    stability: real("stability"),
    difficulty: real("difficulty"),
    due: integer("due").notNull(),
    lastReview: integer("last_review"),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    elapsedDays: integer("elapsed_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    suspended: integer("suspended").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.cardId] })],
);

export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    clientEventId: text("client_event_id").notNull(),
    rating: integer("rating").notNull(),
    stateBefore: text("state_before").notNull(),
    stabilityBefore: real("stability_before"),
    difficultyBefore: real("difficulty_before"),
    stabilityAfter: real("stability_after"),
    difficultyAfter: real("difficulty_after"),
    elapsedDays: integer("elapsed_days").notNull(),
    scheduledDays: integer("scheduled_days").notNull(),
    durationMs: integer("duration_ms"),
    reviewedAt: integer("reviewed_at").notNull(),
    studyDay: text("study_day").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("review_logs_idem_idx").on(t.userId, t.clientEventId),
    index("review_logs_day_idx").on(t.userId, t.studyDay),
    index("review_logs_replay_idx").on(t.userId, t.cardId, t.reviewedAt),
  ],
);

export type CardStateRow = typeof cardStates.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type CardRow = typeof cards.$inferSelect;
