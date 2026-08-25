/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * 验证码错误计数与封禁记录。
 *
 * 数据存放在插件的本地基础设施库（ctx.linearpress.db），与业务数据库（可能被
 * MySQL 驱动替换）解耦；即使切换数据库驱动，人机验证状态仍留在本地。
 *
 * 语义（时间戳均为 Date.now() 毫秒值）：
 *  - fails：当前累计的验证码错误次数，验证通过即清零；
 *  - banUntil：非空且大于当前时间时，该主体被暂时封禁（拒绝一切验证，即使输入正确）。
 */

export interface CaptchaDb {
  exec(sql: string): void;
  prepare(sql: string): {
    run(...params: unknown[]): { changes?: number | bigint; lastInsertRowid?: number | bigint };
    get(...params: unknown[]): unknown;
  };
}

export interface AttemptRow { fails: number; banUntil: number | null; }

const MS = 60_000;

export function ensureSchema(db: CaptchaDb): void {
  db.exec(`CREATE TABLE IF NOT EXISTS ec_attempts (
    scope TEXT PRIMARY KEY,
    fails INTEGER NOT NULL DEFAULT 0,
    ban_until INTEGER
  );`);
}

export function getAttempt(db: CaptchaDb, scope: string): AttemptRow {
  const row = db.prepare('SELECT fails, ban_until FROM ec_attempts WHERE scope=?').get(scope) as { fails?: number; ban_until?: number | null } | undefined;
  if (!row) return { fails: 0, banUntil: null };
  return { fails: Number(row.fails ?? 0), banUntil: row.ban_until ? Number(row.ban_until) : null };
}

/** 记录一次失败并返回累计次数（首次自动创建行）。 */
export function recordFailure(db: CaptchaDb, scope: string): number {
  db.prepare('INSERT INTO ec_attempts(scope, fails) VALUES(?, 1) ON CONFLICT(scope) DO UPDATE SET fails = ec_attempts.fails + 1').run(scope);
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

/** 清理过期封禁且长期无活动的行（由 Effect 定时调用，防止表膨胀）。 */
export function sweepExpired(db: CaptchaDb, now: number): void {
  // 封禁已过期超过 24 小时且计数为 0 的行可安全删除；计数仍>0 说明窗口内仍在重试，保留。
  db.prepare('DELETE FROM ec_attempts WHERE ban_until IS NOT NULL AND ban_until < ? AND fails = 0').run(now - 24 * 60 * 60 * 1000);
}

/** 人类可读的剩余封禁时长（分钟），如「5 分钟」/「2 小时 3 分钟」。 */
export function formatBanRemaining(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / MS));
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const remain = minutes % 60;
  return remain ? `${hours} 小时 ${remain} 分钟` : `${hours} 小时`;
}