/*
 * Easy Captcha Attempt Store
 *
 * Counts wrong answers per client IP and holds temporary lockouts.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Keyed by IP, never by username: keying by the account being signed in to
 * let anyone lock the owner out by typing wrong answers on purpose.</p>
 *
 * @since 1.0.0
 */

import type { DatabaseService } from 'linearpress/plugin-api';

export interface Attempt { fails: number; banUntil: number | null; }

export async function ensureSchema(db: DatabaseService): Promise<void> {
  const mysql = db.dialect === 'mysql';
  await db.exec(`CREATE TABLE IF NOT EXISTS ec_attempts (scope ${mysql ? 'VARCHAR(191)' : 'TEXT'} PRIMARY KEY, fails INT NOT NULL DEFAULT 0, ban_until BIGINT NULL, last_fail BIGINT NULL)`);
  if (!await db.hasColumn('ec_attempts', 'last_fail')) await db.exec('ALTER TABLE ec_attempts ADD COLUMN last_fail BIGINT NULL');
}

export async function getAttempt(db: DatabaseService, scope: string): Promise<Attempt> {
  const row = await db.get<{ fails: number; ban_until: number | null }>('SELECT fails, ban_until FROM ec_attempts WHERE scope = ?', scope);
  return row ? { fails: Number(row.fails), banUntil: row.ban_until ? Number(row.ban_until) : null } : { fails: 0, banUntil: null };
}

/** Add a failure and return the new count. Failures older than `windowMs` start a fresh count. */
export async function recordFailure(db: DatabaseService, scope: string, now: number, windowMs: number): Promise<number> {
  const current = await db.get<{ fails: number; last_fail: number | null }>('SELECT fails, last_fail FROM ec_attempts WHERE scope = ?', scope);
  const fails = current && current.last_fail && now - Number(current.last_fail) < windowMs ? Number(current.fails) + 1 : 1;
  await db.upsert('ec_attempts', { scope, fails, last_fail: now, ban_until: null }, ['scope'], ['fails', 'last_fail']);
  return fails;
}

export const setBan = (db: DatabaseService, scope: string, until: number) => db.upsert('ec_attempts', { scope, fails: 0, ban_until: until, last_fail: Date.now() }, ['scope'], ['fails', 'ban_until', 'last_fail']);
export const clearScope = (db: DatabaseService, scope: string) => db.run('DELETE FROM ec_attempts WHERE scope = ?', scope);
export const sweepExpired = (db: DatabaseService, now: number) => db.run('DELETE FROM ec_attempts WHERE (last_fail IS NULL OR last_fail < ?) AND (ban_until IS NULL OR ban_until < ?)', now - 86400_000, now);

export function formatRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} 小时 ${minutes % 60} 分钟` : `${hours} 小时`;
}
