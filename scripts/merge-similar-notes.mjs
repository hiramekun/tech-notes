#!/usr/bin/env node

// 公開済みノート同士のなかから「実質的に同じトピック」を Claude に見つけさせ、
// 一番古く作られたノートにマージして更新し、新しく作られた重複ノートを削除する。
// archive ワークフローと同様に `npm ci` を経ずに動くため、Node 標準モジュールだけで完結させる。

import { appendFile, readdir, readFile, rm, writeFile } from "node:fs/promises";
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

const NOTES_DIRECTORY = "notes";
const DEMO_DIRECTORY = "_demo";

export function chooseCategory(labels) {
  return labels.find((label) => GENRE_LABELS.has(label)) ?? "uncategorized";
}

function parseScalar(raw) {
  const value = String(raw ?? "").trim();
  if (value === "") return "";
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.replace(/^"|"$/g, "");
    }
  }
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

// buildMarkdown が生成する範囲の YAML front matter だけを解釈する軽量パーサ。
export function parseFrontMatter(source) {
  const lines = String(source ?? "").split("\n");
  if (lines[0]?.trim() !== "---") {
    throw new Error("Note is missing YAML front matter.");
  }

  const data = {};
  let currentListKey = null;
  let index = 1;

  for (; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === "---") {
      index += 1;
      break;
    }

    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentListKey) {
      data[currentListKey].push(parseScalar(listItem[1]));
      continue;
    }

    const keyValue = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValue) continue;

    const [, key, rawValue] = keyValue;
    if (rawValue === "") {
      data[key] = [];
      currentListKey = key;
    } else {
      data[key] = parseScalar(rawValue);
      currentListKey = null;
    }
  }

  return { data, body: lines.slice(index).join("\n") };
}

function stripFencedCodeBlocks(markdown) {
  const lines = markdown.split("\n");
  let fence = null;

  return lines
    .map((line) => {
      if (!fence) {
        const openingFence = line.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
        if (!openingFence) return line;

        fence = { character: openingFence[1][0], length: openingFence[1].length };
        return "";
      }

      const closingFence = new RegExp(`^[ \\t]{0,3}${fence.character}{${fence.length},}[ \\t]*$`);
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
    throw new Error("Merged note body is too short to be a knowledge note.");
  }

  const structuralBody = stripFencedCodeBlocks(body);

  if (/^---\s*$/m.test(structuralBody.slice(0, 20)) || /^#\s+/m.test(structuralBody)) {
    throw new Error("Merged note body must not contain YAML front matter or an H1 heading.");
  }

  const missingSections = REQUIRED_SECTION_PATTERNS.filter(([, pattern]) => !pattern.test(structuralBody)).map(
    ([section]) => section,
  );

  if (missingSections.length > 0) {
    throw new Error(`Merged note body is missing required sections: ${missingSections.join(", ")}`);
  }

  return body;
}

export function unionLabels(...labelGroups) {
  const seen = new Set();
  const result = [];
  for (const label of labelGroups.flat()) {
    const name = String(label ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}

function laterDate(left, right) {
  const leftTime = left ? Date.parse(left) : Number.NaN;
  const rightTime = right ? Date.parse(right) : Number.NaN;
  if (Number.isNaN(leftTime)) return right ?? left ?? null;
  if (Number.isNaN(rightTime)) return left ?? null;
  return rightTime >= leftTime ? right : left;
}

// ノートが「作られた」時刻。archived_at → closed_at の順で採用し、
// いずれも無い場合は issue 番号(小さいほど古い)で近似する。
function createdOrder(data) {
  const timeSource = data.archived_at || data.closed_at || "";
  const time = timeSource ? Date.parse(timeSource) : Number.NaN;
  const issue = Number(data.issue) || Number.MAX_SAFE_INTEGER;
  return { time: Number.isNaN(time) ? Number.POSITIVE_INFINITY : time, issue };
}

async function findNoteFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const nested = await Promise.all(
    entries.map(async (entry) => {
      if (entry.name === DEMO_DIRECTORY) return [];
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) return findNoteFiles(absolutePath);
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        return [absolutePath];
      }
      return [];
    }),
  );

  return nested.flat();
}

// 公開済みノートの一覧を Claude に渡すためのメタデータに整形する(本文は含めない)。
export async function listNotes(rootDirectory = process.cwd()) {
  const notesDirectory = path.join(rootDirectory, NOTES_DIRECTORY);
  const files = await findNoteFiles(notesDirectory);

  const notes = [];
  for (const filePath of files) {
    const source = await readFile(filePath, "utf8");
    let data;
    try {
      ({ data } = parseFrontMatter(source));
    } catch {
      data = {};
    }
    if (data.demo === true) continue;

    notes.push({
      path: path.relative(rootDirectory, filePath).split(path.sep).join("/"),
      title: data.title ? String(data.title) : path.basename(filePath, ".md"),
      category: data.category ? String(data.category) : path.basename(path.dirname(filePath)),
      labels: Array.isArray(data.labels) ? data.labels.map(String) : [],
      issue: Number(data.issue) || null,
      closedAt: data.closed_at ? String(data.closed_at) : null,
      archivedAt: data.archived_at ? String(data.archived_at) : null,
    });
  }

  notes.sort((left, right) => (left.path < right.path ? -1 : 1));
  return notes;
}

// notes 配下の実在しうる .md パスだけを許可する(トラバーサル・demo・README を拒否)。
export function resolveNotePath(targetPath, rootDirectory = process.cwd()) {
  if (typeof targetPath !== "string") return null;

  const normalized = targetPath.trim().replace(/^\.\//, "").split(path.sep).join("/");
  if (normalized === "" || !normalized.endsWith(".md")) return null;

  const segments = normalized.split("/");
  if (segments[0] !== NOTES_DIRECTORY) return null;
  if (segments.includes("..") || segments.includes(".") || segments.includes(DEMO_DIRECTORY)) return null;
  if (segments[segments.length - 1] === "README.md") return null;

  const absolute = path.resolve(rootDirectory, normalized);
  const notesRoot = path.resolve(rootDirectory, NOTES_DIRECTORY);
  if (absolute !== notesRoot && !absolute.startsWith(notesRoot + path.sep)) return null;

  return { relative: normalized, absolute };
}

// グループのメンバー(front matter 済み)から、最も古いノートを基準にマージ結果を組み立てる。
// members: [{ path, data }]
export function planMergeGroup(members, mergedBody, updatedAt = new Date().toISOString()) {
  const sorted = [...members].sort((left, right) => {
    const a = createdOrder(left.data);
    const b = createdOrder(right.data);
    return a.time - b.time || a.issue - b.issue;
  });

  const base = sorted[0];
  const others = sorted.slice(1);
  const body = validateKnowledgeBody(mergedBody);

  const title = String(base.data.title ?? "");
  const baseIssue = Number(base.data.issue) || null;
  const url = base.data.url ? String(base.data.url) : null;
  // カテゴリ(= 配置ディレクトリ)は基準ノートのものを維持し、ファイル移動を伴わないようにする。
  const category = base.data.category ? String(base.data.category) : chooseCategory(unionLabels(...members.map((m) => m.data.labels || [])));

  const labels = unionLabels(...members.map((member) => member.data.labels || []));

  const mergedIssues = new Set();
  for (const member of members) {
    for (const value of Array.isArray(member.data.merged_issues) ? member.data.merged_issues : []) {
      const number = Number(value);
      if (Number.isInteger(number) && number > 0) mergedIssues.add(number);
    }
    const issue = Number(member.data.issue);
    if (Number.isInteger(issue) && issue > 0) mergedIssues.add(issue);
  }
  if (baseIssue) mergedIssues.delete(baseIssue);
  const mergedIssueList = [...mergedIssues].sort((a, b) => a - b);

  let closedAt = base.data.closed_at ? String(base.data.closed_at) : null;
  for (const member of members) {
    closedAt = laterDate(closedAt, member.data.closed_at ? String(member.data.closed_at) : null);
  }

  const lines = [
    "---",
    `title: ${JSON.stringify(title)}`,
    ...(baseIssue !== null ? [`issue: ${baseIssue}`] : []),
    ...(url ? [`url: ${JSON.stringify(url)}`] : []),
    `category: ${JSON.stringify(category)}`,
    "labels:",
    ...labels.map((label) => `  - ${JSON.stringify(label)}`),
    ...(closedAt ? [`closed_at: ${JSON.stringify(closedAt)}`] : []),
    ...(base.data.archived_at ? [`archived_at: ${JSON.stringify(String(base.data.archived_at))}`] : []),
    `updated_at: ${JSON.stringify(updatedAt)}`,
    ...(mergedIssueList.length > 0 ? ["merged_issues:", ...mergedIssueList.map((number) => `  - ${number}`)] : []),
    `generated_by: ${JSON.stringify("claude-code-action")}`,
    "---",
    "",
    `# ${title}`,
    "",
    body,
    "",
  ];

  return {
    basePath: base.path,
    markdown: lines.join("\n"),
    deletePaths: others.map((member) => member.path),
  };
}

async function writeOutputs(outputs) {
  if (!process.env.GITHUB_OUTPUT) return;

  const body = Object.entries(outputs)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  await appendFile(process.env.GITHUB_OUTPUT, `${body}\n`, "utf8");
}

async function prepare() {
  const notes = await listNotes();
  const contextPath = path.join(process.cwd(), ".notes-merge-context.json");
  await writeFile(contextPath, `${JSON.stringify({ notes }, null, 2)}\n`, "utf8");
  await writeOutputs({ context_path: contextPath, note_count: String(notes.length) });
  console.log(`Prepared ${notes.length} note(s) for duplicate detection.`);
}

async function readMember(relativePath, usedPaths, rootDirectory) {
  const resolved = resolveNotePath(relativePath, rootDirectory);
  if (!resolved) {
    console.warn(`Skipping invalid note path: ${relativePath}`);
    return null;
  }
  if (usedPaths.has(resolved.relative)) {
    console.warn(`Skipping note already handled in another group: ${resolved.relative}`);
    return null;
  }

  let source;
  try {
    source = await readFile(resolved.absolute, "utf8");
  } catch {
    console.warn(`Skipping missing note: ${resolved.relative}`);
    return null;
  }

  let data;
  try {
    ({ data } = parseFrontMatter(source));
  } catch {
    console.warn(`Skipping note without valid front matter: ${resolved.relative}`);
    return null;
  }

  return { path: resolved.relative, absolute: resolved.absolute, data };
}

async function apply() {
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

  const merges = Array.isArray(result.merges) ? result.merges : [];
  const rootDirectory = process.cwd();
  const usedPaths = new Set();
  const changedPaths = [];
  const deletedPaths = [];

  for (const merge of merges) {
    const candidatePaths = [
      ...(typeof merge.base_path === "string" ? [merge.base_path] : []),
      ...(Array.isArray(merge.merge_paths) ? merge.merge_paths : []),
    ];

    const members = [];
    for (const candidate of candidatePaths) {
      const member = await readMember(candidate, usedPaths, rootDirectory);
      // 重複した path 指定は 1 回だけ採用する
      if (member && !members.some((existing) => existing.path === member.path)) {
        members.push(member);
      }
    }

    if (members.length < 2) {
      console.warn("Skipping merge group with fewer than 2 valid notes.");
      continue;
    }

    let plan;
    try {
      plan = planMergeGroup(members, merge.markdown);
    } catch (error) {
      console.warn(`Skipping merge group: ${error.message}`);
      continue;
    }

    await writeFile(path.resolve(rootDirectory, plan.basePath), plan.markdown, "utf8");
    changedPaths.push(plan.basePath);
    usedPaths.add(plan.basePath);

    for (const deletePath of plan.deletePaths) {
      await rm(path.resolve(rootDirectory, deletePath));
      deletedPaths.push(deletePath);
      usedPaths.add(deletePath);
    }

    console.log(
      `Merged ${plan.deletePaths.length} note(s) into ${plan.basePath}: ` +
        `deleted ${plan.deletePaths.join(", ")}.`,
    );
  }

  const hasChanges = changedPaths.length > 0;
  const commitMessage = hasChanges
    ? `Merge ${deletedPaths.length} duplicate note(s) into ${changedPaths.length} note(s)`
    : "";

  await writeOutputs({
    has_changes: String(hasChanges),
    changed_paths: changedPaths.join(" "),
    deleted_paths: deletedPaths.join(" "),
    commit_message: commitMessage,
  });

  if (!hasChanges) {
    console.log("No duplicate notes were merged.");
  }
}

async function main() {
  const command = process.argv[2];

  if (command === "prepare") return prepare();
  if (command === "apply") return apply();
  throw new Error('Expected command "prepare" or "apply".');
}

const isDirectExecution = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isDirectExecution) {
  await main();
}
