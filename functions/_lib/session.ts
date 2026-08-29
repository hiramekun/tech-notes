import { verifyAccessUser } from "./access";
import { getDb, type Db } from "./db";
import type { Env } from "./env";
import { currentUser, type SessionUser } from "./study";

/** 全エンドポイント共通の入り口。Access の検証とユーザー解決をまとめる */
export async function openSession(request: Request, env: Env): Promise<{ db: Db; user: SessionUser }> {
  const identity = await verifyAccessUser(request, env);
  const db = getDb(env);
  const user = await currentUser(db, identity);
  return { db, user };
}
