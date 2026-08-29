import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

import type { Env } from "./env";
import { unauthorized } from "./http";

export interface AccessIdentity {
  /** Access の JWT の sub。ユーザーの同一性はこれで判定する */
  sub: string;
  email: string;
}

/**
 * JWKS はモジュールスコープに置く。同じ isolate に載っているあいだは
 * 取得結果が再利用され、リクエストごとの subrequest にならない。
 */
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function jwksFor(teamDomain: string) {
  jwks ??= createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  return jwks;
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

/**
 * Cloudflare Access が付けた JWT を検証して識別子を取り出す。
 *
 * Access を有効にしていても Functions に直接届く経路は残りうるので、
 * 「Access が手前にいるから安全」と考えずに必ずここを通す。
 * 署名のない Cf-Access-Authenticated-User-Email は使わない。
 */
export async function verifyAccessUser(request: Request, env: Env): Promise<AccessIdentity> {
  if (env.LOCAL_DEV_EMAIL) {
    // ローカル開発時のみ。Env の説明を参照
    return { sub: `local-dev:${env.LOCAL_DEV_EMAIL}`, email: env.LOCAL_DEV_EMAIL };
  }

  const token =
    request.headers.get("Cf-Access-Jwt-Assertion") ?? readCookie(request, "CF_Authorization");
  if (!token) {
    throw unauthorized("Access のトークンがありません");
  }

  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, jwksFor(env.ACCESS_TEAM_DOMAIN), {
      issuer: `https://${env.ACCESS_TEAM_DOMAIN}`,
      audience: env.ACCESS_AUD,
    }));
  } catch {
    throw unauthorized("Access のトークンを検証できませんでした");
  }

  const sub = payload.sub;
  const email = typeof payload.email === "string" ? payload.email : null;
  if (!sub || !email) {
    throw unauthorized("Access のトークンに sub / email が含まれていません");
  }

  return { sub, email };
}
