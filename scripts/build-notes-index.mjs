#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

const projectRoot = process.cwd();
const notesDirectory = path.join(projectRoot, "notes");
const outputDirectory = path.join(projectRoot, "public", "data");
const outputFile = path.join(outputDirectory, "notes.json");
const includeDemoNotes =
  process.env.GITHUB_ACTIONS !== "true" && process.env.INCLUDE_DEMO_NOTES !== "false";

async function findMarkdownFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }

  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) return findMarkdownFiles(absolutePath);
      if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md") {
        return [absolutePath];
      }

      return [];
    }),
  );

  return nestedFiles.flat();
}

function normalizeLabels(labels) {
  if (Array.isArray(labels)) return labels.map(String);
  if (typeof labels === "string") {
    return labels
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean);
  }
  return [];
}

function estimateReadingTime(markdown) {
  const characterCount = markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/[#>*_`\-[\]()]/g, "")
    .replace(/\s/g, "").length;

  return Math.max(1, Math.ceil(characterCount / 600));
}

async function buildIndex() {
  const files = await findMarkdownFiles(notesDirectory);
  const notes = await Promise.all(
    files.map(async (filePath) => {
      const source = await readFile(filePath, "utf8");
      const { data, content } = matter(source);
      if (data.demo === true && !includeDemoNotes) return null;

      const relativePath = path.relative(notesDirectory, filePath);
      const fallbackId = relativePath.replace(/\.md$/, "").replaceAll(path.sep, "-");

      return {
        id: String(data.issue ?? fallbackId),
        title: String(data.title ?? path.basename(filePath, ".md")),
        category: String(data.category ?? path.dirname(relativePath)),
        labels: normalizeLabels(data.labels),
        issueNumber: Number(data.issue) || null,
        sourceUrl: data.url ? String(data.url) : null,
        closedAt: data.closed_at ? String(data.closed_at) : null,
        readingTime: estimateReadingTime(content),
        content: content.trim(),
      };
    }),
  );

  const availableNotes = notes.filter(Boolean);

  availableNotes.sort((left, right) => {
    const leftDate = left.closedAt ? Date.parse(left.closedAt) : 0;
    const rightDate = right.closedAt ? Date.parse(right.closedAt) : 0;
    return rightDate - leftDate;
  });

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(availableNotes, null, 2)}\n`, "utf8");
  console.log(
    `Generated ${path.relative(projectRoot, outputFile)} with ${availableNotes.length} note(s)` +
      `${includeDemoNotes ? " (including local demos)" : ""}.`,
  );
}

await buildIndex();
