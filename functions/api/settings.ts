import { eq } from "drizzle-orm";

import type { Env } from "../_lib/env";
import { badRequest, handle, json, readJson } from "../_lib/http";
import { userSettings } from "../_lib/schema";
import { openSession } from "../_lib/session";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { user } = await openSession(request, env);
    return json(user.settings);
  });

interface Patch {
  timezone?: string;
  dayStartHour?: number;
  desiredRetention?: number;
  newPerDay?: number;
  reviewsPerDay?: number;
  maxIntervalDays?: number;
}

/** 範囲は migrations 側の CHECK 制約と合わせてある */
const RANGES = {
  dayStartHour: [0, 23],
  desiredRetention: [0.7, 0.98],
  newPerDay: [0, 100],
  reviewsPerDay: [0, 500],
  maxIntervalDays: [1, 36500],
} as const;

export const onRequestPatch: PagesFunction<Env> = async ({ request, env }) =>
  handle(async () => {
    const { db, user } = await openSession(request, env);
    const patch = await readJson<Patch>(request);
    const update: Record<string, string | number> = {};

    if (patch.timezone !== undefined) {
      if (typeof patch.timezone !== "string" || patch.timezone.length > 64) {
        throw badRequest("timezone が不正です");
      }
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: patch.timezone });
      } catch {
        throw badRequest(`知らないタイムゾーンです: ${patch.timezone}`);
      }
      update.timezone = patch.timezone;
    }

    for (const [key, [min, max]] of Object.entries(RANGES)) {
      const value = patch[key as keyof typeof RANGES];
      if (value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
        throw badRequest(`${key} は ${min} 〜 ${max} の範囲で指定してください`);
      }
      update[key] = key === "desiredRetention" ? value : Math.trunc(value);
    }

    if (Object.keys(update).length === 0) throw badRequest("更新する項目がありません");

    const [updated] = await db
      .update(userSettings)
      .set({ ...update, updatedAt: Date.now() })
      .where(eq(userSettings.userId, user.id))
      .returning();

    return json(updated);
  });
