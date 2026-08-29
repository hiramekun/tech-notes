import assert from "node:assert/strict";
import test from "node:test";

import { buildStatements, cardIdFor, contentHash, quote, toEpochMs } from "./sync-notes-to-d1.mjs";

test("quote はシングルクォートをエスケープする", () => {
  assert.equal(quote("it's"), "'it''s'");
  assert.equal(quote(null), "NULL");
  assert.equal(quote(undefined), "NULL");
});

test("toEpochMs は ISO 文字列をミリ秒に変換し、壊れた値は NULL にする", () => {
  assert.equal(toEpochMs("2026-07-23T11:40:27Z"), String(Date.parse("2026-07-23T11:40:27Z")));
  assert.equal(toEpochMs(""), "NULL");
  assert.equal(toEpochMs("not a date"), "NULL");
});

test("contentHash は同じ本文で安定し、変わると別の値になる", () => {
  assert.equal(contentHash("abc"), contentHash("abc"));
  assert.notEqual(contentHash("abc"), contentHash("abd"));
});

test("cardIdFor はノート ID から決まる", () => {
  assert.equal(cardIdFor("26"), "26:note:0");
});

test("buildStatements はノートごとに notes と cards の upsert を出し、最後に retire を足す", () => {
  const statements = buildStatements(
    [
      {
        id: "26",
        issueNumber: 26,
        title: "Bigtable の使い所",
        category: "database",
        labels: ["database", "type:comparison"],
        sourceUrl: "https://example.com/26",
        closedAt: "2026-07-23T11:40:27Z",
        content: "本文",
      },
    ],
    1_700_000_000_000,
  );

  assert.equal(statements.length, 3);
  assert.match(statements[0], /^INSERT INTO notes /);
  assert.match(statements[0], /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.match(statements[1], /^INSERT INTO cards /);
  assert.match(statements[1], /ON CONFLICT\(note_id, kind, ordinal\) DO UPDATE SET/);
  assert.match(statements[2], /UPDATE cards SET retired_at = 1700000000000 WHERE retired_at IS NULL AND note_id NOT IN \('26'\);/);
});

test("本文が変わったときだけ content_updated_at を進める", () => {
  const [, cardStatement] = buildStatements(
    [{ id: "7", title: "t", category: "infra", labels: [], content: "x" }],
    1234,
  );

  assert.match(
    cardStatement,
    /content_updated_at = CASE WHEN cards\.content_hash <> excluded\.content_hash THEN 1234 ELSE cards\.content_updated_at END/,
  );
});

test("ノートが 0 件なら全カードを retire する", () => {
  const statements = buildStatements([], 99);
  assert.equal(statements.length, 1);
  assert.equal(statements[0], "UPDATE cards SET retired_at = 99 WHERE retired_at IS NULL;");
});
