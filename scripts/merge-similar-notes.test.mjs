import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFrontMatter,
  planMergeGroup,
  resolveNotePath,
  unionLabels,
  validateKnowledgeBody,
} from "./merge-similar-notes.mjs";

const knowledgeBody = [
  "## 概要",
  "",
  "WebSocket は双方向のリアルタイム通信を可能にするプロトコルです。用途に応じて使い分けます。",
  "",
  "## 何が嬉しいのか",
  "",
  "サーバーからのプッシュが自然に行え、ポーリングの無駄を減らせます。",
  "",
  "## 詳細",
  "",
  "ハンドシェイクで接続を確立し、以後はフレーム単位でやり取りします。再接続はアプリ側で実装します。",
  "",
  "## 参考リンク",
  "",
  "- https://datatracker.ietf.org/doc/html/rfc6455",
].join("\n");

const olderNote = {
  path: "notes/backend/12.md",
  data: {
    title: "WebSocket の基本知識",
    issue: 12,
    url: "https://github.com/example/tech-notes/issues/12",
    category: "backend",
    labels: ["backend", "type:concept"],
    closed_at: "2026-07-01T00:00:00Z",
    archived_at: "2026-07-01T01:00:00Z",
  },
};

const newerNote = {
  path: "notes/backend/55.md",
  data: {
    title: "WebSocket の再接続処理",
    issue: 55,
    url: "https://github.com/example/tech-notes/issues/55",
    category: "backend",
    labels: ["backend", "type:howto"],
    closed_at: "2026-08-13T00:00:00Z",
    archived_at: "2026-08-01T01:00:00Z",
  },
};

test("parseFrontMatter reads scalars and list values", () => {
  const source = [
    "---",
    'title: "WebSocket"',
    "issue: 12",
    "labels:",
    '  - "backend"',
    '  - "type:concept"',
    "demo: false",
    "---",
    "",
    "# WebSocket",
  ].join("\n");
  const { data, body } = parseFrontMatter(source);
  assert.equal(data.title, "WebSocket");
  assert.equal(data.issue, 12);
  assert.equal(data.demo, false);
  assert.deepEqual(data.labels, ["backend", "type:concept"]);
  assert.match(body, /# WebSocket/);
});

test("unionLabels merges without duplicates and preserves order", () => {
  assert.deepEqual(unionLabels(["backend", "type:concept"], ["backend", "type:howto"]), [
    "backend",
    "type:concept",
    "type:howto",
  ]);
});

test("resolveNotePath accepts notes paths and rejects unsafe ones", () => {
  const root = "/repo";
  assert.deepEqual(resolveNotePath("notes/backend/12.md", root), {
    relative: "notes/backend/12.md",
    absolute: "/repo/notes/backend/12.md",
  });
  assert.equal(resolveNotePath("", root), null);
  assert.equal(resolveNotePath("notes/backend/12.txt", root), null);
  assert.equal(resolveNotePath("notes/../secrets.md", root), null);
  assert.equal(resolveNotePath("notes/_demo/saga.md", root), null);
  assert.equal(resolveNotePath("notes/README.md", root), null);
  assert.equal(resolveNotePath("docs/backend/12.md", root), null);
});

test("validateKnowledgeBody requires the standard note sections", () => {
  assert.equal(validateKnowledgeBody(knowledgeBody), knowledgeBody);
  assert.throws(() => validateKnowledgeBody("## 概要\n\n短い本文"), /too short/);
});

test("planMergeGroup keeps the oldest note and deletes the newer ones", () => {
  // Claude が新しい方を base に渡してきても、最古のノートを基準にする(順序非依存)。
  const plan = planMergeGroup([newerNote, olderNote], knowledgeBody, "2026-08-14T00:00:00Z");

  assert.equal(plan.basePath, "notes/backend/12.md");
  assert.deepEqual(plan.deletePaths, ["notes/backend/55.md"]);

  // canonical な identity は最古ノートのものを維持
  assert.match(plan.markdown, /title: "WebSocket の基本知識"/);
  assert.match(plan.markdown, /issue: 12/);
  assert.match(plan.markdown, /issues\/12"/);
  assert.match(plan.markdown, /category: "backend"/);
  // 取り込んだ新しい issue は merged_issues に記録
  assert.match(plan.markdown, /merged_issues:\n {2}- 55/);
  // ラベルは和集合
  assert.match(plan.markdown, /- "type:concept"/);
  assert.match(plan.markdown, /- "type:howto"/);
  // closed_at は最新、archived_at は最古、updated_at を付与
  assert.match(plan.markdown, /closed_at: "2026-08-13T00:00:00Z"/);
  assert.match(plan.markdown, /archived_at: "2026-07-01T01:00:00Z"/);
  assert.match(plan.markdown, /updated_at: "2026-08-14T00:00:00Z"/);
  // H1 は最古ノートのタイトル
  assert.match(plan.markdown, /# WebSocket の基本知識/);
});

test("planMergeGroup validates the merged body", () => {
  assert.throws(() => planMergeGroup([olderNote, newerNote], "短すぎる本文"), /too short/);
});
