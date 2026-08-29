#!/usr/bin/env node
/**
 * public/data/notes.json から D1 用の同期 SQL を生成する。
 *
 *   node scripts/build-notes-index.mjs
 *   node scripts/sync-notes-to-d1.mjs --out /tmp/sync.sql
 *   npx wrangler d1 execute tech-notes --remote -c wrangler.d1.jsonc --file=/tmp/sync.sql
 *
 * 本文そのものは D1 に入れない。入れるのはメタデータと content_hash だけで、
 * 本文は従来どおり静的ファイルとして配信する。
 *
 * ノートの本文が変わってもカードの暗記度は引き継ぐ。同期がするのは
 * content_hash と content_updated_at の更新までで、card_states には触らない。
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const projectRoot = process.cwd();
const notesJsonPath = path.join(projectRoot, "public", "data", "notes.json");

/** SQL の文字列リテラル。NULL と数値以外はすべてここを通す */
export function quote(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function toEpochMs(value) {
  if (!value) return "NULL";
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? "NULL" : String(parsed);
}

export function contentHash(content) {
  return createHash("sha256").update(content ?? "", "utf8").digest("hex");
}

/** Phase1 は 1 ノート = 1 カード。id は読める形で固定しておく */
export function cardIdFor(noteId) {
  return `${noteId}:note:0`;
}

export function buildStatements(notes, now) {
  const statements = [];

  for (const note of notes) {
    const hash = contentHash(note.content);

    statements.push(
      `INSERT INTO notes (id, issue_number, title, category, labels, source_url, closed_at, content_hash, updated_at)\n` +
        `VALUES (${quote(note.id)}, ${note.issueNumber ?? "NULL"}, ${quote(note.title)}, ${quote(note.category)}, ` +
        `${quote(JSON.stringify(note.labels ?? []))}, ${quote(note.sourceUrl)}, ${toEpochMs(note.closedAt)}, ` +
        `${quote(hash)}, ${now})\n` +
        `ON CONFLICT(id) DO UPDATE SET\n` +
        `  issue_number = excluded.issue_number,\n` +
        `  title = excluded.title,\n` +
        `  category = excluded.category,\n` +
        `  labels = excluded.labels,\n` +
        `  source_url = excluded.source_url,\n` +
        `  closed_at = excluded.closed_at,\n` +
        `  content_hash = excluded.content_hash,\n` +
        `  updated_at = excluded.updated_at;`,
    );

    statements.push(
      `INSERT INTO cards (id, note_id, kind, ordinal, front, back, content_hash, content_updated_at, created_at)\n` +
        `VALUES (${quote(cardIdFor(note.id))}, ${quote(note.id)}, 'note', 0, ${quote(note.title)}, '', ${quote(hash)}, NULL, ${now})\n` +
        `ON CONFLICT(note_id, kind, ordinal) DO UPDATE SET\n` +
        `  front = excluded.front,\n` +
        `  content_hash = excluded.content_hash,\n` +
        // 本文が変わったことは記録するが、暗記度はそのまま引き継ぐ
        `  content_updated_at = CASE WHEN cards.content_hash <> excluded.content_hash THEN ${now} ELSE cards.content_updated_at END,\n` +
        `  retired_at = NULL;`,
    );
  }

  // リポジトリから消えたノートのカードは、消さずに retire する
  const ids = notes.map((note) => quote(note.id)).join(", ");
  statements.push(
    ids.length > 0
      ? `UPDATE cards SET retired_at = ${now} WHERE retired_at IS NULL AND note_id NOT IN (${ids});`
      : `UPDATE cards SET retired_at = ${now} WHERE retired_at IS NULL;`,
  );

  return statements;
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;
  if (!outPath) {
    console.error("使い方: node scripts/sync-notes-to-d1.mjs --out <path>");
    process.exit(1);
  }

  const notes = JSON.parse(await readFile(notesJsonPath, "utf8"));
  const statements = buildStatements(notes, Date.now());
  const sql = `-- scripts/sync-notes-to-d1.mjs が生成\n${statements.join("\n\n")}\n`;

  await writeFile(outPath, sql, "utf8");
  console.log(`Wrote ${outPath} (${notes.length} note(s), ${statements.length} statement(s)).`);
}

const isDirectExecution = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isDirectExecution) {
  await main();
}
