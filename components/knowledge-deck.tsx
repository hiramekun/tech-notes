"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type Variants } from "motion/react";
import { ArrowLeft, ArrowRight, BookOpen, ExternalLink, Shuffle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";

type Note = {
  id: string;
  title: string;
  category: string;
  labels: string[];
  issueNumber: number | null;
  sourceUrl: string | null;
  closedAt: string | null;
  readingTime: number;
  content: string;
};

type SwipeCardProps = {
  note: Note;
  direction: number;
  pageNumber: number;
  totalPages: number;
  onSwipe: (direction: number) => void;
};

const SWIPE_DISTANCE = 100;
const SWIPE_VELOCITY = 500;

const cardVariants: Variants = {
  exit: (customDirection: number) => ({
    x: customDirection * 560,
    opacity: 0,
    rotate: customDirection * 10,
    // M3 の emphasized accelerate イージング (退場)
    transition: { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] },
  }),
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

function shuffleIndexes(length: number, previousIndex?: number) {
  const indexes = Array.from({ length }, (_, index) => index);

  for (let index = indexes.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [indexes[index], indexes[randomIndex]] = [indexes[randomIndex], indexes[index]];
  }

  if (length > 1 && previousIndex !== undefined && indexes[0] === previousIndex) {
    [indexes[0], indexes[1]] = [indexes[1], indexes[0]];
  }

  return indexes;
}

function formatDate(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function SwipeCard({ note, direction, pageNumber, totalPages, onSwipe }: SwipeCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-420, 0, 420], [-7, 0, 7]);
  const opacity = useTransform(x, [-480, -220, 0, 220, 480], [0, 1, 1, 1, 0]);
  const leftCueOpacity = useTransform(x, [-150, -45, 0], [1, 0.25, 0]);
  const rightCueOpacity = useTransform(x, [0, 45, 150], [0, 0.25, 1]);

  return (
    <motion.article
      className="knowledge-card"
      style={{ x, rotate, opacity }}
      custom={direction}
      variants={cardVariants}
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 23 } }}
      exit="exit"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      dragMomentum={false}
      dragDirectionLock
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) >= SWIPE_DISTANCE || Math.abs(info.velocity.x) >= SWIPE_VELOCITY) {
          onSwipe(info.offset.x >= 0 ? 1 : -1);
        }
      }}
      aria-label={`${note.title}の技術レポート`}
    >
      <motion.span className="swipe-cue swipe-cue-left" style={{ opacity: leftCueOpacity }}>
        <ArrowLeft aria-hidden="true" size={16} /> めくる
      </motion.span>
      <motion.span className="swipe-cue swipe-cue-right" style={{ opacity: rightCueOpacity }}>
        めくる <ArrowRight aria-hidden="true" size={16} />
      </motion.span>

      <header className="card-header">
        <div className="card-overline">
          <span>TECHNICAL REPORT</span>
          <span>RANDOM ARCHIVE</span>
        </div>
        <div className="card-meta-row">
          <span className={`md-chip md-chip--small category category-${note.category}`}>
            {categoryNames[note.category] ?? note.category}
          </span>
          {note.issueNumber && <span className="issue-number">ISSUE #{note.issueNumber}</span>}
        </div>
        <h2>{note.title}</h2>
        <div className="card-submeta">
          <span>
            <BookOpen aria-hidden="true" size={15} /> 約{note.readingTime}分
          </span>
          {formatDate(note.closedAt) && <span>{formatDate(note.closedAt)} 更新</span>}
        </div>
      </header>

      <div className="card-content">
        <MarkdownContent content={note.content} />
      </div>

      <footer className="card-footer">
        <div className="tag-list" aria-label="ラベル">
          {note.labels.slice(0, 4).map((label) => (
            <span className="md-chip md-chip--outlined md-chip--small" key={label}>
              {label}
            </span>
          ))}
        </div>
        <div className="report-footer-meta">
          {note.sourceUrl && (
            <a className="md-button md-button--text" href={note.sourceUrl} target="_blank" rel="noreferrer">
              Issueを開く <ExternalLink aria-hidden="true" size={16} />
            </a>
          )}
          <span className="report-folio">
            {String(pageNumber).padStart(2, "0")} / {String(totalPages).padStart(2, "0")}
          </span>
        </div>
      </footer>
    </motion.article>
  );
}

export function KnowledgeDeck() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

    fetch(`${basePath}/data/notes.json`)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load notes");
        return response.json();
      })
      .then((data: Note[]) => {
        const requestedNoteId = new URLSearchParams(window.location.search).get("note");
        const requestedIndex = data.findIndex((note) => note.id === requestedNoteId);
        const nextOrder = shuffleIndexes(data.length);

        if (requestedIndex >= 0) {
          const requestedPosition = nextOrder.indexOf(requestedIndex);
          [nextOrder[0], nextOrder[requestedPosition]] = [nextOrder[requestedPosition], nextOrder[0]];
        }

        setNotes(data);
        setOrder(nextOrder);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  const currentIndex = order[position];
  const currentNote = currentIndex === undefined ? null : notes[currentIndex];

  const advance = useCallback(
    (nextDirection: number) => {
      if (!currentNote) return;
      setDirection(nextDirection);

      if (position >= order.length - 1) {
        setOrder(shuffleIndexes(notes.length, currentIndex));
        setPosition(0);
        setCycle((currentCycle) => currentCycle + 1);
      } else {
        setPosition((currentPosition) => currentPosition + 1);
      }
    },
    [currentIndex, currentNote, notes.length, order.length, position],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowLeft") advance(-1);
      if (event.key === "ArrowRight") advance(1);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [advance]);

  const progressText = useMemo(() => {
    if (!notes.length) return "0 / 0";
    return `${Math.min(position + 1, notes.length)} / ${notes.length}`;
  }, [notes.length, position]);

  if (loading) {
    return (
      <section className="deck-state" aria-live="polite">
        <span className="md-circular-progress" role="progressbar" aria-label="読み込み中" />
        <h2>レポートを準備中</h2>
        <p>技術ノートのアーカイブを読み込んでいます。</p>
      </section>
    );
  }

  if (failed) {
    return (
      <section className="deck-state deck-error" role="alert">
        <h2>レポートを読み込めませんでした</h2>
        <p>しばらく待ってから、もう一度ページを開いてください。</p>
      </section>
    );
  }

  if (!currentNote) {
    return (
      <section className="deck-state deck-empty">
        <span className="empty-number">00</span>
        <h2>最初のレポートを待っています</h2>
        <p>回答済みのIssueをクローズすると、ここに技術レポートが追加されます。</p>
        <a
          className="md-button md-button--filled"
          href="https://github.com/hiramekun/tech-notes/issues"
          target="_blank"
          rel="noreferrer"
        >
          Issueを見る <ExternalLink aria-hidden="true" size={16} />
        </a>
      </section>
    );
  }

  return (
    <section className="deck-section" aria-label="知識レポート">
      <div className="deck-status" aria-live="polite">
        <span>{progressText}</span>
        <span className="md-chip md-chip--tonal md-chip--small">
          <Shuffle aria-hidden="true" size={14} /> ランダム表示
        </span>
      </div>

      <div className="card-stage">
        <div className="card-stack-layer card-stack-layer-back" />
        <div className="card-stack-layer card-stack-layer-front" />
        <AnimatePresence custom={direction}>
          <SwipeCard
            key={`${cycle}-${currentNote.id}`}
            note={currentNote}
            direction={direction}
            pageNumber={position + 1}
            totalPages={notes.length}
            onSwipe={advance}
          />
        </AnimatePresence>
      </div>

      <div className="deck-controls">
        <button
          className="md-icon-button md-icon-button--outlined md-icon-button--large"
          type="button"
          onClick={() => advance(-1)}
          aria-label="左へめくって次のレポートへ"
        >
          <ArrowLeft aria-hidden="true" />
        </button>
        <p>
          <strong>次のノートへ</strong>
          <span>左右にドラッグ / 矢印キー</span>
        </p>
        <button className="md-fab" type="button" onClick={() => advance(1)} aria-label="右へめくって次のレポートへ">
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
