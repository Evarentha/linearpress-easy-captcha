/*
 * Captcha Failure Counter and Ban Store
 *
 * Tracks wrong-captcha counts and temporary bans in the plugin's local infrastructure database.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Captcha failure counts and ban records.
 *
 * <p>Data lives in the plugin's local infrastructure database (ctx.linearpress.db), decoupled from
 * the business database (which may be swapped to the MySQL driver); even if the database driver is
 * changed, human-verification state stays local.</p>
 *
 * Semantics (all timestamps are Date.now() milliseconds):
 * <ul>
 * <li>fails — currently accumulated wrong-captcha count; reset to zero once verification passes.</li>
 * <li>banUntil — when non-null and greater than the current time, the subject is temporarily
 * banned (all verification attempts rejected, even with correct input).</li>
 * </ul>
 *
 * @since 1.0.0
 */

export interface CaptchaDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  };
}

export interface AttemptRow { fails: number; banUntil: number | null; }

const MS = 60_000;

export function ensureSchema(db: CaptchaDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ec_attempts (
    scope TEXT PRIMARY KEY,
    fails INTEGER NOT NULL DEFAULT 0,
    ban_until INTEGER,
    last_fail INTEGER
  );`);
  const columns = db.prepare("PRAGMA table_info('ec_attempts')").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === 'last_fail')) db.exec('ALTER TABLE ec_attempts ADD COLUMN last_fail INTEGER');
}

export function getAttempt(db: CaptchaDb, scope: string): AttemptRow {
  const row = db.prepare('SELECT fails, ban_until FROM ec_attempts WHERE scope=?').get(scope) as { fails?: number; ban_until?: number | null } | undefined;
  if (!row) return { fails: 0, banUntil: null };
  return { fails: Number(row.fails ?? 0), banUntil: row.ban_until ? Number(row.ban_until) : null };
}

/** 记录一次失败并返回累计次数（首次自动创建行；now 写入 last_fail 活跃时间戳）。 */
export function recordFailure(db: CaptchaDb, scope: string, now: number): number {
  db.prepare('INSERT INTO ec_attempts(scope, fails, last_fail) VALUES(?, 1, ?) ON CONFLICT(scope) DO UPDATE SET fails = ec_attempts.fails + 1, last_fail = excluded.last_fail').run(scope, now);
  const row = db.prepare('SELECT fails FROM ec_attempts WHERE scope=?').get(scope) as { fails?: number } | undefined;
  return Number(row?.fails ?? 1);
}

/** 设置封禁截止时间（毫秒时间戳）。 */
export function setBan(db: CaptchaDb, scope: string, until: number): void {
  db.prepare('INSERT INTO ec_attempts(scope, fails, ban_until) VALUES(?, 0, ?) ON CONFLICT(scope) DO UPDATE SET ban_until = excluded.ban_until').run(scope, until);
}

/** 验证通过：清除该主体的计数与过期封禁。 */
export function clearScope(db: CaptchaDb, scope: string): void {
  db.prepare('DELETE FROM ec_attempts WHERE scope=?').run(scope);
}

/** 清理陈旧行（由 Effect 定时调用，防止表膨胀）。 */
export function sweepExpired(db: CaptchaDb, now: number): void {
  // 24 小时内无失败记录且无生效封禁的行可安全删除（含一次性攻击者留下的残留计数）。
  db.prepare('DELETE FROM ec_attempts WHERE (last_fail IS NULL OR last_fail < ?) AND (ban_until IS NULL OR ban_until < ?)').run(now - 24 * 60 * 60 * 1000, now);
}

/** 人类可读的剩余封禁时长（分钟），如「5 分钟」/「2 小时 3 分钟」。 */
export function formatBanRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MS));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours} 小时 ${remain} 分钟` : `${hours} 小时`;
}