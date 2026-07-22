"use client";

import { ArrowRight, BookOpen, Shuffle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

type NoteSummary = {
  id: string;
  title: string;
  category: string;
  closedAt: string | null;
  readingTime: number;
};

const categoryNames: Record<string, string> = {
  frontend: "Frontend",
  backend: "Backend",
  infra: "Infrastructure",
  database: "Database",
  language: "Language",
  "ai-ml": "AI / ML",
  security: "Security",
  devops: "DevOps",
  architecture: "Architecture",
  "cs-fundamentals": "CS Fundamentals",
  uncategorized: "Knowledge",
};

function formatDate(value: string | null) {
  if (!value) return "日付未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

export function ReportIndex() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

    fetch(`${basePath}/data/notes.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load notes");
        return response.json();
      })
      .then((data: NoteSummary[]) => setNotes(data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="report-index" aria-labelledby="report-index-title">
      <header className="report-index-heading">
        <div>
          <p className="index-eyebrow">NOTE INDEX</p>
          <h1 id="report-index-title">全てのノート</h1>
          <p>{loading ? "ノートを読み込んでいます。" : `${notes.length}件のノートを、新しい順に並べています。`}</p>
        </div>
        <Link className="md-button md-button--filled random-report-link" href="/">
          <Shuffle aria-hidden="true" size={18} />
          ランダムに読む
        </Link>
      </header>

      {failed ? (
        <div className="index-message" role="alert">
          記事一覧を読み込めませんでした。しばらく待ってから再度お試しください。
        </div>
      ) : loading ? (
        <div className="report-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="report-title-card report-title-card-loading" key={index} />
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="index-message">まだ記事がありません。</div>
      ) : (
        <div className="report-grid">
          {notes.map((note, index) => (
            <Link
              className="report-title-card"
              href={{ pathname: "/", query: { note: note.id } }}
              key={note.id}
            >
              <div className="report-title-card-top">
                <span className="report-index-number">{String(index + 1).padStart(2, "0")}</span>
                <span className={`md-chip md-chip--small category category-${note.category}`}>
                  {categoryNames[note.category] ?? note.category}
                </span>
              </div>
              <h2>{note.title}</h2>
              <div className="report-title-card-footer">
                <span>{formatDate(note.closedAt)}</span>
                <span>
                  <BookOpen aria-hidden="true" size={14} /> 約{note.readingTime}分
                </span>
                <ArrowRight className="report-card-arrow" aria-hidden="true" size={19} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
