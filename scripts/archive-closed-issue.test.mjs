import assert from "node:assert/strict";
import test from "node:test";

import {
  buildKnowledgeBody,
  buildMarkdown,
  chooseCategory,
  cleanAssistantComment,
} from "./archive-closed-issue.mjs";

const issue = {
  number: 42,
  title: "React の状態管理",
  body: "React の状態管理について教えて",
  html_url: "https://github.com/example/tech-notes/issues/42",
  closed_at: "2026-07-22T00:00:00Z",
  labels: [{ name: "frontend" }, { name: "type:concept" }],
};

function aiComment(body, createdAt) {
  return {
    body,
    created_at: createdAt,
    user: { login: "claude[bot]", type: "Bot" },
  };
}

test("chooseCategory selects a known genre label", () => {
  assert.equal(chooseCategory(["type:concept", "frontend"]), "frontend");
  assert.equal(chooseCategory(["type:concept"]), "uncategorized");
});

test("cleanAssistantComment removes the action wrapper and progress footer", () => {
  const cleaned = cleanAssistantComment(`**Claude finished @user's task in 1m**\n\n---\n### 概要\n\n本文\n\n---\n### 進行状況\n\n- [x] 完了`);
  assert.equal(cleaned, "### 概要\n\n本文");
});

test("buildKnowledgeBody keeps the complete answer and appends later follow-ups", () => {
  const comments = [
    aiComment("### 概要\n\n短い補足です。", "2026-07-22T01:00:00Z"),
    aiComment(
      "### 概要\n\n概要です。\n\n### 何が嬉しいのか\n\n利点です。\n\n### 詳細\n\n詳細です。\n\n### 参考リンク\n\n- https://example.com",
      "2026-07-22T02:00:00Z",
    ),
    aiComment(
      "追加質問への回答です。状態管理はアプリケーションの規模に合わせて選択します。詳しい補足をここに記載します。",
      "2026-07-22T03:00:00Z",
    ),
  ];

  const body = buildKnowledgeBody(issue, comments);
  assert.match(body, /### 詳細/);
  assert.match(body, /## 追加の議論/);
  assert.match(body, /追加質問への回答/);
});

test("buildMarkdown produces stable front matter and category", () => {
  const result = buildMarkdown(issue, [], "2026-07-22T04:00:00Z");
  assert.equal(result.category, "frontend");
  assert.match(result.markdown, /issue: 42/);
  assert.match(result.markdown, /category: "frontend"/);
  assert.match(result.markdown, /# React の状態管理/);
});
