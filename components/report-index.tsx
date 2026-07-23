"use client";

import { ArrowRight, BookOpen, Check, Search, Shuffle, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type NoteSummary = {
  id: string;
  title: string;
  category: string;
  labels: string[];
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

const ALL = "all";

function formatDate(value: string | null) {
  if (!value) return "日付未設定";

  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function categoryLabel(category: string) {
  return categoryNames[category] ?? category;
}

export function ReportIndex() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(ALL);

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

  // 出現するカテゴリを件数付きで、新しい順の並びを保って集計する
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      counts.set(note.category, (counts.get(note.category) ?? 0) + 1);
    }
    return Array.from(counts, ([id, count]) => ({ id, count }));
  }, [notes]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      if (activeCategory !== ALL && note.category !== activeCategory) return false;
      if (!normalizedQuery) return true;

      const haystack = [note.title, categoryLabel(note.category), ...note.labels].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [notes, activeCategory, normalizedQuery]);

  const hasFilter = activeCategory !== ALL || normalizedQuery.length > 0;

  const summaryText = loading
    ? "ノートを読み込んでいます。"
    : hasFilter
      ? `${notes.length}件中 ${filteredNotes.length}件を表示しています。`
      : `${notes.length}件のノートを、新しい順に並べています。`;

  function resetFilters() {
    setQuery("");
    setActiveCategory(ALL);
  }

  return (
    <section className="report-index" aria-labelledby="report-index-title">
      <header className="report-index-heading">
        <div>
          <h1 id="report-index-title">全てのノート</h1>
          <p aria-live="polite">{summaryText}</p>
        </div>
        <Link className="md-button md-button--filled random-report-link" href="/">
          <Shuffle aria-hidden="true" size={18} />
          ランダムに読む
        </Link>
      </header>

      {!failed && !loading && notes.length > 0 && (
        <div className="index-toolbar">
          <div className="index-search">
            <Search className="index-search-icon" aria-hidden="true" size={18} />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="タイトル・タグで検索"
              aria-label="ノートを検索"
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className="index-search-clear" onClick={() => setQuery("")} aria-label="検索をクリア">
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          <div className="category-filter" role="group" aria-label="カテゴリで絞り込み">
            <button
              type="button"
              className="md-chip category-filter-chip"
              aria-pressed={activeCategory === ALL}
              onClick={() => setActiveCategory(ALL)}
            >
              {activeCategory === ALL && <Check aria-hidden="true" size={15} />}
              すべて
              <span className="category-filter-count">{notes.length}</span>
            </button>
            {categories.map((category) => {
              const selected = activeCategory === category.id;
              return (
                <button
                  key={category.id}
                  type="button"
                  className="md-chip category-filter-chip"
                  aria-pressed={selected}
                  onClick={() => setActiveCategory(selected ? ALL : category.id)}
                >
                  {selected && <Check aria-hidden="true" size={15} />}
                  {categoryLabel(category.id)}
                  <span className="category-filter-count">{category.count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

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
      ) : filteredNotes.length === 0 ? (
        <div className="index-message">
          <p>条件に合うノートが見つかりませんでした。</p>
          <button type="button" className="md-button md-button--text" onClick={resetFilters}>
            絞り込みをリセット
          </button>
        </div>
      ) : (
        <div className="report-grid">
          {filteredNotes.map((note, index) => (
            <Link
              className="report-title-card"
              href={{ pathname: "/", query: { note: note.id } }}
              key={note.id}
            >
              <div className="report-title-card-top">
                <span className="report-index-number">{String(index + 1).padStart(2, "0")}</span>
                <span className={`md-chip md-chip--small category category-${note.category}`}>
                  {categoryLabel(note.category)}
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
