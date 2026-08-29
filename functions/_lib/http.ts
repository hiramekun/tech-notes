/** ハンドラから投げるとそのままレスポンスになるエラー */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const unauthorized = (message: string) => new HttpError(401, "unauthorized", message);
export const badRequest = (message: string) => new HttpError(400, "bad_request", message);
export const notFound = (message: string) => new HttpError(404, "not_found", message);

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // 学習状態は常に最新を取りに行かせる。Service Worker にも拾わせない
      "cache-control": "no-store",
    },
  });
}

/** ハンドラを包んで、HttpError を JSON のエラー応答に変換する */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ error: error.code, message: error.message }, error.status);
    }
    console.error("unhandled error", error);
    return json({ error: "internal", message: "サーバ側でエラーが発生しました" }, 500);
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw badRequest("リクエストボディが JSON として解釈できません");
  }
}
