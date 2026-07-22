#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const GENRE_LABELS = new Set([
  "frontend",
  "backend",
  "infra",
  "database",
  "language",
  "ai-ml",
  "security",
  "devops",
  "architecture",
  "cs-fundamentals",
]);

const REQUIRED_SECTION_PATTERNS = [
  /^#{2,4}\s*概要\s*$/m,
  /^#{2,4}\s*何が嬉しいのか\s*$/m,
  /^#{2,4}\s*詳細\s*$/m,
  /^#{2,4}\s*参考リンク\s*$/m,
];

export function chooseCategory(labels) {
  return labels.find((label) => GENRE_LABELS.has(label)) ?? "uncategorized";
}

export function isAiComment(comment) {
  const login = comment?.user?.login ?? "";
  const isBot = comment?.user?.type === "Bot" || login.endsWith("[bot]");
  return isBot && /(claude|codex|openai)/i.test(login);
}

export function cleanAssistantComment(rawBody) {
  let body = String(rawBody ?? "").trim();
  const firstDivider = body.indexOf("\n---\n");

  if (firstDivider >= 0 && firstDivider < 600 && /\b(Claude|Codex) finished\b/i.test(body.slice(0, firstDivider))) {
    body = body.slice(firstDivider + 5).trim();
  }

  const finalDivider = body.lastIndexOf("\n---\n");
  if (finalDivider >= 0) {
    const trailingText = body.slice(finalDivider + 5);
    if (/進行状況|対応完了|issue 内容の確認|タイトルを.+変更|ラベルを付与/i.test(trailingText)) {
      body = body.slice(0, finalDivider).trim();
    }
  }

  return body;
}

function scoreComment(comment) {
  const body = cleanAssistantComment(comment.body);
  const sectionScore = REQUIRED_SECTION_PATTERNS.reduce(
    (score, pattern) => score + (pattern.test(body) ? 1 : 0),
    0,
  );
  return sectionScore * 100_000 + Math.min(body.length, 99_999);
}

export function buildKnowledgeBody(issue, comments) {
  const assistantComments = comments
    .filter(isAiComment)
    .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at));

  if (assistantComments.length === 0) {
    return [
      "## 概要",
      "",
      "このノートには AI による最終回答がなかったため、クローズ時点の issue 本文を保存しています。",
      "",
      "## Issue の内容",
      "",
      String(issue.body || "本文はありません。").trim(),
    ].join("\n");
  }

  const canonicalComment = assistantComments.reduce((best, candidate) =>
    scoreComment(candidate) >= scoreComment(best) ? candidate : best,
  );
  const canonicalBody = cleanAssistantComment(canonicalComment.body);
  const canonicalTime = Date.parse(canonicalComment.created_at);
  const supplements = assistantComments
    .filter((comment) => Date.parse(comment.created_at) > canonicalTime)
    .map((comment) => cleanAssistantComment(comment.body))
    .filter((body) => body.length >= 40 && body !== canonicalBody);

  if (supplements.length === 0) return canonicalBody;

  const supplementalBody = supplements
    .map((body, index) => `### 追加回答 ${index + 1}\n\n${body}`)
    .join("\n\n");

  return `${canonicalBody}\n\n## 追加の議論\n\n${supplementalBody}`;
}

export function buildMarkdown(issue, comments, archivedAt = new Date().toISOString()) {
  const labels = (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  const category = chooseCategory(labels);
  const lines = [
    "---",
    `title: ${JSON.stringify(issue.title)}`,
    `issue: ${issue.number}`,
    `url: ${JSON.stringify(issue.html_url)}`,
    `category: ${JSON.stringify(category)}`,
    "labels:",
    ...labels.map((label) => `  - ${JSON.stringify(label)}`),
    `closed_at: ${JSON.stringify(issue.closed_at)}`,
    `archived_at: ${JSON.stringify(archivedAt)}`,
    "---",
    "",
    `# ${issue.title}`,
    "",
    buildKnowledgeBody(issue, comments),
    "",
  ];

  return { category, markdown: lines.join("\n") };
}

async function fetchIssueComments(repository, issueNumber, token) {
  const comments = [];

  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `https://api.github.com/repos/${repository}/issues/${issueNumber}/comments?per_page=100&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "tech-notes-archiver",
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch issue comments: ${response.status} ${response.statusText}`);
    }

    const pageComments = await response.json();
    comments.push(...pageComments);
    if (pageComments.length < 100) break;
  }

  return comments;
}

async function main() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!eventPath || !repository || !token) {
    throw new Error("GITHUB_EVENT_PATH, GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  }

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  const issue = event.issue;

  if (event.action !== "closed" || !issue?.number) {
    throw new Error("This script only accepts an issues.closed event payload.");
  }

  const comments = await fetchIssueComments(repository, issue.number, token);
  const { category, markdown } = buildMarkdown(issue, comments);
  const relativePath = path.join("notes", category, `${issue.number}.md`);
  const outputPath = path.join(process.cwd(), relativePath);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `path=${relativePath}\n`, "utf8");
  }

  console.log(`Archived issue #${issue.number} to ${relativePath}.`);
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  await main();
}
