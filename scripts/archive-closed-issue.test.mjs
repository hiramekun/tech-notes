import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIssueContext,
  buildMarkdown,
  chooseCategory,
  cleanAssistantComment,
  validateKnowledgeBody,
} from "./archive-closed-issue.mjs";

const issue = {
  number: 42,
  title: "React の状態管理",
  body: "React の状態管理について教えて",
  html_url: "https://github.com/example/tech-notes/issues/42",
  closed_at: "2026-07-22T00:00:00Z",
  labels: [{ name: "frontend" }, { name: "type:concept" }],
};

const knowledgeBody = [
  "## 概要",
  "",
  "Reactの状態管理について、Issue内の議論を整理した概要です。用途に応じて管理方法を選択します。",
  "",
  "## 何が嬉しいのか",
  "",
  "状態の責務を明確にすることで、変更しやすい設計になります。",
  "",
  "## 詳細",
  "",
  "ローカル状態と共有状態を分け、必要な範囲にだけ状態を公開します。実装では更新頻度も考慮します。",
  "",
  "## 参考リンク",
  "",
  "- https://react.dev/learn/managing-state",
].join("\n");

test("chooseCategory selects a known genre label", () => {
  assert.equal(chooseCategory(["type:concept", "frontend"]), "frontend");
  assert.equal(chooseCategory(["type:concept"]), "uncategorized");
});

test("cleanAssistantComment removes the action wrapper and progress footer", () => {
  const cleaned = cleanAssistantComment(`**Claude finished @user's task in 1m**\n\n---\n### 概要\n\n本文\n\n---\n### 進行状況\n\n- [x] 完了`);
  assert.equal(cleaned, "### 概要\n\n本文");
});

test("buildIssueContext keeps the full discussion in chronological order", () => {
  const context = buildIssueContext(issue, [
    {
      body: "後の質問です。",
      created_at: "2026-07-22T03:00:00Z",
      user: { login: "hiramekun", type: "User" },
    },
    {
      body: "先の回答です。",
      created_at: "2026-07-22T01:00:00Z",
      user: { login: "claude[bot]", type: "Bot" },
    },
  ]);

  assert.equal(context.issue.title, issue.title);
  assert.deepEqual(context.issue.labels, ["frontend", "type:concept"]);
  assert.equal(context.comments[0].body, "先の回答です。");
  assert.equal(context.comments[1].body, "後の質問です。");
});

test("validateKnowledgeBody requires the standard note sections", () => {
  assert.equal(validateKnowledgeBody(knowledgeBody), knowledgeBody);
  assert.throws(() => validateKnowledgeBody("## 概要\n\n短い本文"), /too short/);
});

test("validateKnowledgeBody ignores heading-like shell comments in fenced code", () => {
  const bodyWithShellComment = knowledgeBody.replace(
    "## 詳細",
    [
      "## 詳細",
      "",
      "```bash",
      "# プロジェクトの初期化",
      "cdk8s init typescript-app",
      "```",
    ].join("\n"),
  );

  assert.equal(validateKnowledgeBody(bodyWithShellComment), bodyWithShellComment);
});

test("validateKnowledgeBody still rejects an H1 outside fenced code", () => {
  assert.throws(
    () => validateKnowledgeBody(`${knowledgeBody}\n\n# 追加の見出し`),
    /must not contain YAML front matter or an H1 heading/,
  );
});

test("buildMarkdown combines deterministic metadata with Claude output", () => {
  const result = buildMarkdown(issue, knowledgeBody, "2026-07-22T04:00:00Z");
  assert.equal(result.category, "frontend");
  assert.match(result.markdown, /issue: 42/);
  assert.match(result.markdown, /category: "frontend"/);
  assert.match(result.markdown, /generated_by: "claude-code-action"/);
  assert.match(result.markdown, /# React の状態管理/);
  assert.match(result.markdown, /## 詳細/);
});
