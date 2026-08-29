import type { Env } from "./_lib/env";

/**
 * 正規のホスト名以外でのアクセスを、正規ホストへ 301 で送り返す。
 *
 * Cloudflare Pages には <project>.pages.dev を無効化する設定が無い。
 * 放っておくと同じサイトが 2 つのホストで配信され、Access の対象は
 * カスタムドメインのパスだけなので、pages.dev 側は保護の外に出てしまう。
 * (API は JWT 検証で 401 になるが、画面はそのまま開けてしまう)
 *
 * ルート直下の _middleware は静的アセットを含む全リクエストを通るので、
 * ここで弾けばホストは 1 つに絞れる。
 */
export const onRequest: PagesFunction<Env> = (context) => {
  const canonical = context.env.CANONICAL_HOST;

  // 未設定なら素通しする。wrangler pages dev で localhost を叩くときのため
  if (!canonical) return context.next();

  const url = new URL(context.request.url);
  if (url.hostname === canonical || url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return context.next();
  }

  url.protocol = "https:";
  url.hostname = canonical;
  url.port = "";
  return Response.redirect(url.toString(), 301);
};
