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
  ["概要", /^#{2}\s*概要\s*$/m],
  ["何が嬉しいのか", /^#{2}\s*何が嬉しいのか\s*$/m],
  ["詳細", /^#{2}\s*詳細\s*$/m],
  ["参考リンク", /^#{2}\s*参考リンク\s*$/m],
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

function labelsFromIssue(issue) {
  return (issue.labels ?? [])
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter(Boolean);
}

export function buildIssueContext(issue, comments) {
  return {
    issue: {
      number: issue.number,
      title: issue.title,
      body: String(issue.body || "本文はありません。").trim(),
      url: issue.html_url,
      labels: labelsFromIssue(issue),
      closedAt: issue.closed_at,
    },
    comments: [...comments]
      .sort((left, right) => Date.parse(left.created_at) - Date.parse(right.created_at))
      .map((comment) => ({
        author: comment.user?.login ?? "unknown",
        authorType: comment.user?.type ?? "Unknown",
        createdAt: comment.created_at,
        body: isAiComment(comment)
          ? cleanAssistantComment(comment.body)
          : String(comment.body ?? "").trim(),
      }))
      .filter((comment) => comment.body.length > 0),
  };
}

function stripFencedCodeBlocks(markdown) {
  const lines = markdown.split("\n");
  let fence = null;

  return lines
    .map((line) => {
      if (!fence) {
        const openingFence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
        if (!openingFence) return line;

        fence = {
          character: openingFence[1][0],
          length: openingFence[1].length,
        };
        return "";
      }

      const closingFence = new RegExp(
        `^[ \\t]{0,3}${fence.character}{${fence.length},}[ \\t]*$`,
      );
      if (closingFence.test(line)) fence = null;
      return "";
    })
    .join("\n");
}

export function validateKnowledgeBody(rawBody) {
  let body = String(rawBody ?? "").trim();

  if (body.startsWith("```markdown") && body.endsWith("```")) {
    body = body.slice("```markdown".length, -3).trim();
  }

  if (body.length < 100) {
    throw new Error("Claude summary is too short to archive as a knowledge note.");
  }

  const structuralBody = stripFencedCodeBlocks(body);

  if (/^---\s*$/m.test(structuralBody.slice(0, 20)) || /^#\s+/m.test(structuralBody)) {
    throw new Error("Claude summary must not contain YAML front matter or an H1 heading.");
  }

  const missingSections = REQUIRED_SECTION_PATTERNS
    .filter(([, pattern]) => !pattern.test(structuralBody))
    .map(([section]) => section);

  if (missingSections.length > 0) {
    throw new Error(`Claude summary is missing required sections: ${missingSections.join(", ")}`);
  }

  return body;
}

export function buildMarkdown(issue, knowledgeBody, archivedAt = new Date().toISOString()) {
  const labels = labelsFromIssue(issue);
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
    `generated_by: ${JSON.stringify("claude-code-action")}`,
    "---",
    "",
    `# ${issue.title}`,
    "",
    validateKnowledgeBody(knowledgeBody),
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

async function loadEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is required.");
  }

  const event = JSON.parse(await readFile(eventPath, "utf8"));
  if (event.action !== "closed" || !event.issue?.number) {
    throw new Error("This script only accepts an issues.closed event payload.");
  }

  return event;
}

function archivePath(issue) {
  const category = chooseCategory(labelsFromIssue(issue));
  return path.join("notes", category, `${issue.number}.md`);
}

async function writeOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;

  const body = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await appendFile(process.env.GITHUB_OUTPUT, `${body}\n`, "utf8");
}

async function prepare() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;

  if (!repository || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  }

  const event = await loadEvent();
  const comments = await fetchIssueComments(repository, event.issue.number, token);
  const context = buildIssueContext(event.issue, comments);
  const contextDirectory = process.cwd();
  const contextPath = path.join(contextDirectory, ".closed-issue-context.json");

  await mkdir(contextDirectory, { recursive: true });
  await writeFile(contextPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  await writeOutputs({ context_path: contextPath, path: archivePath(event.issue) });
  console.log(`Prepared issue #${event.issue.number} context with ${comments.length} comment(s).`);
}

async function finalize() {
  const event = await loadEvent();
  const structuredOutput = process.env.CLAUDE_STRUCTURED_OUTPUT;

  if (!structuredOutput) {
    throw new Error("CLAUDE_STRUCTURED_OUTPUT is required.");
  }

  let result;
  try {
    result = JSON.parse(structuredOutput);
  } catch (error) {
    throw new Error(`Failed to parse Claude structured output: ${error.message}`);
  }

  const relativePath = archivePath(event.issue);
  const outputPath = path.join(process.cwd(), relativePath);
  const { markdown } = buildMarkdown(event.issue, result.markdown);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, markdown, "utf8");
  await writeOutputs({ path: relativePath });
  console.log(`Archived Claude summary for issue #${event.issue.number} to ${relativePath}.`);
}

async function main() {
  const command = process.argv[2];

  if (command === "prepare") return prepare();
  if (command === "finalize") return finalize();
  throw new Error('Expected command "prepare" or "finalize".');
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  await main();
}
