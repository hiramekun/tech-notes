import type { PendingReview, QueueResponse, ReviewsResponse } from "./types";

/**
 * Access のセッションが切れると、API への fetch にはログイン画面への
 * リダイレクトが返る。クロスオリジンなので放っておくとネットワークエラーに
 * 見えてしまい、「オフラインだ」と誤判定してしまう。
 * redirect: "manual" で投げて opaqueredirect を掴まえ、これを区別する。
 */
export class SessionExpiredError extends Error {
  constructor() {
    super("Cloudflare Access のセッションが切れました");
    this.name = "SessionExpiredError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    redirect: "manual",
    cache: "no-store",
    headers: init?.body ? { "content-type": "application/json", ...init.headers } : init?.headers,
  });

  if (response.type === "opaqueredirect" || response.status === 0 || response.status === 401) {
    throw new SessionExpiredError();
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(response.status, body?.message ?? `リクエストに失敗しました (${response.status})`);
  }

  return (await response.json()) as T;
}

const REAUTH_KEY = "tech-notes:reauth-at";
const REAUTH_COOLDOWN_MS = 15_000;

/**
 * セッション切れは画面ごと再読み込みして Access に再認証させる。
 *
 * ただしリダイレクトの原因が Access とは限らない(開発サーバの末尾スラッシュ
 * リダイレクトなど)。無条件にリロードすると無限ループになるので、直前に
 * 試したばかりなら諦めて false を返し、呼び出し側にメッセージを出させる。
 */
export function recoverFromExpiredSession(): boolean {
  try {
    const last = Number(sessionStorage.getItem(REAUTH_KEY) ?? 0);
    if (Date.now() - last < REAUTH_COOLDOWN_MS) return false;
    sessionStorage.setItem(REAUTH_KEY, String(Date.now()));
  } catch {
    // sessionStorage が使えない環境でも、1 回はリロードを試す
  }

  window.location.reload();
  return true;
}

export function fetchQueue(limit = 20) {
  // URL が毎回同じだとブラウザのメモリキャッシュから返ることがある。
  // レスポンスには no-store を付けているが、古いキューを掴むと
  // 採点済みのカードがもう一度出てくるので、URL 側でも重ならないようにする
  return request<QueueResponse>(`/api/study/queue?limit=${limit}&_t=${Date.now()}`);
}

export function postReviews(reviews: PendingReview[]) {
  return request<ReviewsResponse>("/api/study/reviews", {
    method: "POST",
    body: JSON.stringify({ reviews }),
  });
}

export function postUndo() {
  return request<{ cardId: string; state: string; due: number; mastery: number }>("/api/study/undo", {
    method: "POST",
  });
}
