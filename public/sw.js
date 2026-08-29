/*
 * Tech Notes Service Worker
 *
 * 静的エクスポート (GitHub Pages) 向けの軽量な SW。
 * basePath は静的ファイルに埋め込めないため、登録時の scope から導出する。
 * - ナビゲーション: network-first（最新を優先し、オフライン時はキャッシュへ）
 * - 同一オリジンの GET: stale-while-revalidate（表示は即座、裏で更新）
 * - 学習 API (/api/): 一切触らない（下の fetch ハンドラの理由を参照）
 */

const VERSION = "v2";
const CACHE = `tech-notes-${VERSION}`;

// registration scope からベースパスを取り出す（末尾スラッシュは残す）
const SCOPE_PATH = new URL(self.registration.scope).pathname;
const APP_SHELL = `${SCOPE_PATH}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll([APP_SHELL, `${SCOPE_PATH}reports/`]))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // 学習 API はキャッシュも横取りもしない。
  // 古いキューを掴むと採点済みのカードがもう一度出てくるし、
  // Cloudflare Access のセッション切れで返るリダイレクトを保存してしまうと、
  // 以後ずっと壊れた応答を返し続けることになる。
  if (url.pathname.startsWith(`${SCOPE_PATH}api/`)) {
    return;
  }

  // ページ遷移: network-first、失敗時はキャッシュ→アプリシェル
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // リダイレクトやエラー応答は残さない（Access のログイン画面を掴まないため）
          if (response.ok && response.type === "basic" && !response.redirected) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match(APP_SHELL)) ?? Response.error()),
    );
    return;
  }

  // その他のアセット: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
