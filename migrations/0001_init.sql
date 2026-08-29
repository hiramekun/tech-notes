-- D1 (SQLite) の初期スキーマ。
-- このファイルが DDL の正であり、functions/_lib/schema.ts はここを写した型定義。
--
-- SQLite にはタイムゾーン付きの時刻型がないため、時刻はすべて Unix epoch(ミリ秒)の
-- INTEGER で保持する。列挙型は TEXT + CHECK、配列は JSON 文字列で表す。
-- id はアプリ側で crypto.randomUUID() を振る。

-- ノート: notes/*.md のミラー。source of truth はリポジトリ側
CREATE TABLE notes (
  id           TEXT PRIMARY KEY,             -- build-notes-index.mjs の id と一致させる
  issue_number INTEGER UNIQUE,
  title        TEXT NOT NULL,
  category     TEXT NOT NULL,
  labels       TEXT NOT NULL DEFAULT '[]',   -- JSON 配列
  source_url   TEXT,
  closed_at    INTEGER,
  content_hash TEXT NOT NULL,                -- 本文の SHA-256。差分検知に使う
  updated_at   INTEGER NOT NULL
);

-- カード: 出題単位。Phase1 は 1 ノート = 1 カード、Phase2 で Q&A に分割する
CREATE TABLE cards (
  id                 TEXT PRIMARY KEY,
  note_id            TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  kind               TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('note','qa','cloze')),
  ordinal            INTEGER NOT NULL DEFAULT 0,
  front              TEXT NOT NULL,
  back               TEXT NOT NULL DEFAULT '',  -- ノート単位カードでは空。本文は静的配信ぶんを使う
  content_hash       TEXT NOT NULL,
  content_updated_at INTEGER,                   -- 本文が変わった時刻。暗記度は引き継ぐが記録は残す
  retired_at         INTEGER,                   -- 消さずに retire する(履歴を残すため)
  created_at         INTEGER NOT NULL,
  UNIQUE (note_id, kind, ordinal)
);

CREATE INDEX cards_note_idx ON cards (note_id);

CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  access_sub TEXT UNIQUE NOT NULL,   -- Cloudflare Access の JWT の sub
  email      TEXT NOT NULL,          -- 表示用。同一性の判定には使わない
  created_at INTEGER NOT NULL
);

CREATE TABLE user_settings (
  user_id           TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  timezone          TEXT    NOT NULL DEFAULT 'Asia/Tokyo',
  day_start_hour    INTEGER NOT NULL DEFAULT 4 CHECK (day_start_hour BETWEEN 0 AND 23),
  desired_retention REAL    NOT NULL DEFAULT 0.90 CHECK (desired_retention BETWEEN 0.70 AND 0.98),
  new_per_day       INTEGER NOT NULL DEFAULT 5   CHECK (new_per_day BETWEEN 0 AND 100),
  reviews_per_day   INTEGER NOT NULL DEFAULT 60  CHECK (reviews_per_day BETWEEN 0 AND 500),
  max_interval_days INTEGER NOT NULL DEFAULT 365 CHECK (max_interval_days BETWEEN 1 AND 36500),
  learning_steps    TEXT    NOT NULL DEFAULT '["1m","10m"]',   -- JSON 配列
  relearning_steps  TEXT    NOT NULL DEFAULT '["10m"]',        -- JSON 配列
  fsrs_params       TEXT,                                      -- JSON 配列(21 個)。NULL なら既定値
  updated_at        INTEGER NOT NULL
);

-- ユーザー x カードの記憶状態(FSRS の Card に相当)
CREATE TABLE card_states (
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id        TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  state          TEXT NOT NULL DEFAULT 'new'
                 CHECK (state IN ('new','learning','review','relearning')),
  stability      REAL,                        -- S(日)。new のうちは NULL
  difficulty     REAL,                        -- D(1〜10)
  due            INTEGER NOT NULL,
  last_review    INTEGER,
  scheduled_days INTEGER NOT NULL DEFAULT 0,
  elapsed_days   INTEGER NOT NULL DEFAULT 0,
  learning_steps INTEGER NOT NULL DEFAULT 0,  -- FSRS の Card.learning_steps(何段目か)
  reps           INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  suspended      INTEGER NOT NULL DEFAULT 0,  -- 真偽値は 0 / 1
  updated_at     INTEGER NOT NULL,
  PRIMARY KEY (user_id, card_id)
);

-- キュー取得はここだけがホットパス。SQLite も部分索引に対応している
CREATE INDEX card_states_due_idx ON card_states (user_id, due) WHERE suspended = 0;
CREATE INDEX card_states_new_idx ON card_states (user_id) WHERE state = 'new' AND suspended = 0;

-- レビュー履歴。監査ログ兼「状態を作り直せる原本」
CREATE TABLE review_logs (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id           TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  client_event_id   TEXT NOT NULL,             -- オフライン再送の冪等キー
  rating            INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  state_before      TEXT NOT NULL,
  stability_before  REAL,
  difficulty_before REAL,
  stability_after   REAL,
  difficulty_after  REAL,
  elapsed_days      INTEGER NOT NULL,
  scheduled_days    INTEGER NOT NULL,
  duration_ms       INTEGER,                   -- カード表示から判断までの時間
  reviewed_at       INTEGER NOT NULL,          -- 端末側の時刻(オフラインぶんは過去)
  study_day         TEXT NOT NULL,             -- 'YYYY-MM-DD'。ロールオーバー適用済み
  created_at        INTEGER NOT NULL
);

CREATE UNIQUE INDEX review_logs_idem_idx   ON review_logs (user_id, client_event_id);
CREATE INDEX        review_logs_day_idx    ON review_logs (user_id, study_day);
CREATE INDEX        review_logs_replay_idx ON review_logs (user_id, card_id, reviewed_at);
