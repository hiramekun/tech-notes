"use client";

import { AnimatePresence, motion, useMotionValue, useTransform, type Variants } from "motion/react";
import { BookOpen, Check, Eye, RotateCcw, WifiOff, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { MarkdownContent } from "@/components/markdown-content";
import {
  ApiError,
  SessionExpiredError,
  fetchQueue,
  postReviews,
  postUndo,
  recoverFromExpiredSession,
} from "@/lib/study/api";
import { enqueue, forget, pending } from "@/lib/study/outbox";
import { SWIPE_RATING, type Counts, type PendingReview, type QueueCard } from "@/lib/study/types";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 520;
const QUEUE_SIZE = 20;
const REAUTH_FAILED = "サインインの状態を確認できませんでした。ページを開き直してください。";

type NoteEntry = {
  id: string;
  title: string;
  category: string;
  sourceUrl: string | null;
  readingTime: number;
  content: string;
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

const cardVariants: Variants = {
  exit: (direction: number) => ({
    x: direction * 560,
    opacity: 0,
    rotate: direction * 10,
    transition: { duration: 0.2, ease: [0.3, 0, 0.8, 0.15] },
  }),
};

/** 暗記度を 5 段階に丸める。生の % より、粒度が粗いほうが読みやすい */
function masteryLevel(mastery: number) {
  return Math.min(Math.floor(mastery / 20), 4);
}

type StudyCardProps = {
  card: QueueCard;
  note: NoteEntry | undefined;
  revealed: boolean;
  direction: number;
  onReveal: () => void;
  onGrade: (rating: 1 | 3) => void;
};

function StudyCard({ card, note, revealed, direction, onReveal, onGrade }: StudyCardProps) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-420, 0, 420], [-7, 0, 7]);
  const opacity = useTransform(x, [-480, -220, 0, 220, 480], [0, 1, 1, 1, 0]);
  const forgotOpacity = useTransform(x, [-150, -45, 0], [1, 0.25, 0]);
  const rememberedOpacity = useTransform(x, [0, 45, 150], [0, 0.25, 1]);

  return (
    <motion.article
      className="knowledge-card study-card"
      style={{ x, rotate, opacity }}
      custom={direction}
      variants={cardVariants}
      initial={{ opacity: 0, scale: 0.96, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 260, damping: 23 } }}
      exit="exit"
      // 答えを見るまではスワイプさせない。見ずに評価しても記録の意味がないため
      drag={revealed ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.8}
      dragMomentum={false}
      dragDirectionLock
      onDragEnd={(_, info) => {
        if (Math.abs(info.offset.x) >= SWIPE_DISTANCE || Math.abs(info.velocity.x) >= SWIPE_VELOCITY) {
          onGrade(info.offset.x >= 0 ? SWIPE_RATING.right : SWIPE_RATING.left);
        }
      }}
      aria-label={`${card.title} の暗記カード`}
    >
      {revealed ? (
        <>
          <motion.span className="swipe-cue swipe-cue-left" style={{ opacity: forgotOpacity }}>
            <X aria-hidden="true" size={16} /> 覚えていない
          </motion.span>
          <motion.span className="swipe-cue swipe-cue-right" style={{ opacity: rememberedOpacity }}>
            覚えている <Check aria-hidden="true" size={16} />
          </motion.span>
        </>
      ) : null}

      <header className="card-header">
        <div className="card-overline">
          <span>{card.isNew ? "NEW CARD" : "REVIEW"}</span>
          <span>{revealed ? "ANSWER" : "RECALL"}</span>
        </div>
        <div className="card-meta-row">
          <span className={`md-chip md-chip--tonal md-chip--small category category-${card.category}`}>
            {categoryNames[card.category] ?? card.category}
          </span>
          <span className="study-mastery" aria-label={`暗記度 ${card.mastery} パーセント`}>
            <span className="study-mastery-bar" data-level={masteryLevel(card.mastery)} aria-hidden="true">
              <span style={{ width: `${card.mastery}%` }} />
            </span>
            <small>{card.mastery}</small>
          </span>
        </div>
        <h2>{card.front}</h2>
      </header>

      {revealed ? (
        <div className="card-content">
          {note ? (
            <MarkdownContent content={note.content} />
          ) : (
            <p className="study-missing">
              このカードの本文を読み込めませんでした。ノートの同期がまだかもしれません。
            </p>
          )}
        </div>
      ) : (
        <div className="card-content study-prompt">
          <p>タイトルだけを見て、中身を思い出してみる。</p>
          <button className="md-button md-button--filled" type="button" onClick={onReveal}>
            <Eye aria-hidden="true" size={18} /> 答えを見る
          </button>
          <small>スペースキーでも開けます</small>
        </div>
      )}
    </motion.article>
  );
}

export function StudyDeck() {
  const [queue, setQueue] = useState<QueueCard[]>([]);
  const [notes, setNotes] = useState<Map<string, NoteEntry>>(new Map());
  const [done, setDone] = useState<Counts>({ new: 0, review: 0 });
  const [remaining, setRemaining] = useState<Counts>({ new: 0, review: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "finished" | "error">("loading");
  const [revealed, setRevealed] = useState(false);
  const [direction, setDirection] = useState(1);
  const [offline, setOffline] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // カードが表示された時刻。下の useEffect で入る(レンダリング中に Date.now() は呼ばない)
  const shownAt = useRef(0);

  /** 溜まっているレビューをまとめて送る。冪等なので何度呼んでも安全 */
  const flush = useCallback(async () => {
    const outstanding = await pending();
    if (outstanding.length === 0) return;

    // 成功すれば送ったぶんは applied か skipped のどちらかに入る。
    // 失敗したときはアウトボックスに残して次の機会に送り直す
    const batch = outstanding.slice(0, 50);

    try {
      const response = await postReviews(batch);
      await forget(batch.map((review) => review.clientEventId));
      setDone(response.done);
      setRemaining(response.remaining);
      setOffline(false);
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        if (!recoverFromExpiredSession()) setMessage(REAUTH_FAILED);
        return;
      }
      if (error instanceof ApiError) {
        setMessage(error.message);
        return;
      }
      // ネットワークエラー。アウトボックスに残したまま次の機会に送る
      setOffline(true);
    }
  }, []);

  const loadQueue = useCallback(async () => {
    try {
      const response = await fetchQueue(QUEUE_SIZE);
      setQueue(response.cards);
      setDone(response.done);
      setRemaining(response.remaining);
      setStatus(response.cards.length === 0 ? "finished" : "ready");
      setRevealed(false);
      setOffline(false);
    } catch (error) {
      if (error instanceof SessionExpiredError && recoverFromExpiredSession()) return;
      if (error instanceof SessionExpiredError) setMessage(REAUTH_FAILED);
      // ApiError はサーバが返した理由をそのまま出す(401 なら設定の問題と分かる)
      if (error instanceof ApiError) setMessage(error.message);
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const loaded = await fetch(`${basePath}/data/notes.json`)
        .then((response) => (response.ok ? (response.json() as Promise<NoteEntry[]>) : []))
        .catch(() => [] as NoteEntry[]);

      if (cancelled) return;
      setNotes(new Map(loaded.map((note) => [note.id, note])));

      await flush();
      if (!cancelled) await loadQueue();
    })();

    return () => {
      cancelled = true;
    };
  }, [flush, loadQueue]);

  // オンラインに戻ったら溜めていたぶんを送る
  useEffect(() => {
    const onOnline = () => void flush();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flush]);

  const current = queue[0];

  useEffect(() => {
    shownAt.current = Date.now();
  }, [current?.cardId]);

  const grade = useCallback(
    (rating: 1 | 3) => {
      if (!current || !revealed) return;

      const review: PendingReview = {
        clientEventId: crypto.randomUUID(),
        cardId: current.cardId,
        rating,
        reviewedAt: Date.now(),
        ...(shownAt.current ? { durationMs: Date.now() - shownAt.current } : {}),
      };

      setDirection(rating === SWIPE_RATING.right ? 1 : -1);
      setRevealed(false);
      setCanUndo(true);
      setQueue((rest) => rest.slice(1));
      setDone((counts) =>
        current.isNew ? { ...counts, new: counts.new + 1 } : { ...counts, review: counts.review + 1 },
      );

      void (async () => {
        await enqueue(review);
        await flush();
      })();
    },
    [current, flush, revealed],
  );

  // 手元のキューが尽きたら次を取りに行く。
  // 先に flush しておかないと、まだ届いていないレビューのぶんで同じカードが返ってくる
  useEffect(() => {
    if (status !== "ready" || queue.length > 0) return;
    void (async () => {
      await flush();
      await loadQueue();
    })();
  }, [flush, loadQueue, queue.length, status]);

  const undo = useCallback(async () => {
    setCanUndo(false);
    try {
      await postUndo();
      setMessage("直前のレビューを取り消しました");
      await loadQueue();
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        if (!recoverFromExpiredSession()) setMessage(REAUTH_FAILED);
        return;
      }
      setMessage(error instanceof ApiError ? error.message : "取り消せませんでした");
    }
  }, [loadQueue]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === " " && !revealed) {
        event.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed) return;
      if (event.key === "ArrowLeft") grade(SWIPE_RATING.left);
      if (event.key === "ArrowRight") grade(SWIPE_RATING.right);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [grade, revealed]);

  if (status === "loading") {
    return (
      <section className="deck-state" aria-live="polite">
        <span className="md-circular-progress" role="progressbar" aria-label="読み込み中" />
        <h2>今日のカードを準備中</h2>
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="deck-state deck-error" role="alert">
        <h2>キューを読み込めませんでした</h2>
        <p>{message ?? "通信の状態を確かめて、もう一度開いてください。"}</p>
        <button className="md-button md-button--filled" type="button" onClick={() => void loadQueue()}>
          再試行
        </button>
      </section>
    );
  }

  if (status === "finished" || !current) {
    return (
      <section className="deck-state deck-empty">
        <span className="empty-number">{done.new + done.review}</span>
        <h2>今日のぶんは終わりました</h2>
        <p>
          新規 {done.new} 枚 / 復習 {done.review} 枚。次の期限が来たらまた出てきます。
        </p>
        <a className="md-button md-button--filled" href={`${basePath}/`}>
          <BookOpen aria-hidden="true" size={16} /> 自由に読む
        </a>
      </section>
    );
  }

  return (
    <section className="deck-section" aria-label="暗記カード">
      <div className="deck-status" aria-live="polite">
        <span>
          残り 復習 {remaining.review} / 新規 {remaining.new}
        </span>
        <span className="study-status-right">
          {offline ? (
            <span className="md-chip md-chip--tonal md-chip--small study-offline">
              <WifiOff aria-hidden="true" size={14} /> 未送信あり
            </span>
          ) : null}
          <button
            className="md-button md-button--text"
            type="button"
            onClick={() => void undo()}
            disabled={!canUndo}
          >
            <RotateCcw aria-hidden="true" size={16} /> 取り消す
          </button>
        </span>
      </div>

      <div className="card-stage">
        <div className="card-stack-layer card-stack-layer-back" />
        <div className="card-stack-layer card-stack-layer-front" />
        <AnimatePresence custom={direction}>
          <StudyCard
            key={current.cardId}
            card={current}
            note={notes.get(current.noteId)}
            revealed={revealed}
            direction={direction}
            onReveal={() => setRevealed(true)}
            onGrade={grade}
          />
        </AnimatePresence>
      </div>

      <div className="deck-controls">
        <button
          className="md-icon-button md-icon-button--outlined md-icon-button--large study-forgot"
          type="button"
          onClick={() => grade(SWIPE_RATING.left)}
          disabled={!revealed}
          aria-label="覚えていない"
        >
          <X aria-hidden="true" />
        </button>
        <p>
          <strong>{revealed ? "覚えていた？" : "まず思い出す"}</strong>
          <span>{revealed ? "左右にドラッグ / 矢印キー" : "スペースキーで答えを見る"}</span>
        </p>
        <button
          className="md-fab study-remembered"
          type="button"
          onClick={() => grade(SWIPE_RATING.right)}
          disabled={!revealed}
          aria-label="覚えている"
        >
          <Check aria-hidden="true" />
        </button>
      </div>

      {message ? (
        <p className="study-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
