/*
 * Easy Captcha Configuration Model
 *
 * Defines the plugin's config schema, defaults, normalization, and settings-form parsing.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Configuration model of the human-verification plugin.
 *
 * <p>The whole config is persisted as JSON in the plugin registry (ctx.plugins.getConfig/setConfig)
 * with defaults + shallow merge, so behavior stays predictable when fields are missing (consistent
 * with advanced-user-management). This module does not depend on Base internals; it only relies on
 * the plugins service exposed by the cordis Context.</p>
 *
 * @since 1.0.0
 */

/** 插件注册表配置服务的最小接口（由 ctx.plugins 满足）。 */
export interface PluginConfigService {
  getConfig<T = unknown>(id: string): T | null;
  setConfig(id: string, config: unknown): void;
}

/** 文本验证码字符集：仅数字 / 仅英文字母 / 两者混合。 */
export type CaptchaCharset = 'number' | 'letter' | 'both';

export interface TextCaptchaConfig {
  /** 文本个数（验证码字符数），1-8，默认 4。 */
  length: number;
  /** 文本类型：数字、英文字母或两者混合。 */
  charset: CaptchaCharset;
  /** 复杂程度 1-3：影响图中干扰点与干扰线的数量。 */
  complexity: number;
  /** 变形程度 1-3：影响字符旋转、倾斜与位移的幅度。 */
  distortion: number;
}

export interface TurnstileConfig {
  /** Cloudflare Turnstile 站点 ID（Site Key）。 */
  siteKey: string;
  /** Cloudflare Turnstile 站点密钥（Secret Key），仅后端使用。 */
  secretKey: string;
}

export interface EasyCaptchaConfig {
  /** 总开关；关闭后所有场景不再校验。 */
  enabled: boolean;
  /** 验证方式：'text' 普通文本验证码 | 'turnstile' Cloudflare Turnstile。 */
  method: 'text' | 'turnstile';
  /** 是否校验登录。 */
  protectLogin: boolean;
  /** 是否校验注册。 */
  protectRegister: boolean;
  /** 是否校验评论。 */
  protectComment: boolean;
  /** 普通文本验证码参数。 */
  text: TextCaptchaConfig;
  /** Cloudflare Turnstile 参数。 */
  turnstile: TurnstileConfig;
  /** 验证码错误次数上限，达到后封禁（默认 5）。 */
  maxFailures: number;
  /** 达到次数上限后的封禁时长（分钟，默认 10）。 */
  banMinutes: number;
}

const DEFAULT_CONFIG: EasyCaptchaConfig = {
  enabled: true,
  method: 'text',
  protectLogin: true,
  protectRegister: true,
  protectComment: true,
  text: {
    length: 4,
    charset: 'both',
    complexity: 1,
    distortion: 1
  },
  turnstile: {
    siteKey: '',
    secretKey: ''
  },
  maxFailures: 5,
  banMinutes: 10
};

export function getDefaultConfig(): EasyCaptchaConfig { return structuredClone(DEFAULT_CONFIG); }

function asBoolean(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function asString(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
function asInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
function asPositiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** 合并用户配置到默认值；未知字段忽略，非法数值回退默认。 */
export function normalizeConfig(raw: unknown): EasyCaptchaConfig {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const defaults = getDefaultConfig();
  const rawText = (input.text && typeof input.text === 'object' ? input.text : {}) as Record<string, unknown>;
  const rawTurnstile = (input.turnstile && typeof input.turnstile === 'object' ? input.turnstile : {}) as Record<string, unknown>;
  const method = input.method === 'turnstile' ? 'turnstile' : 'text';
  return {
    enabled: asBoolean(input.enabled, defaults.enabled),
    method,
    protectLogin: asBoolean(input.protectLogin, defaults.protectLogin),
    protectRegister: asBoolean(input.protectRegister, defaults.protectRegister),
    protectComment: asBoolean(input.protectComment, defaults.protectComment),
    text: {
      length: asInt(rawText.length, defaults.text.length, 1, 8),
      charset: rawText.charset === 'number' || rawText.charset === 'letter' ? rawText.charset : 'both',
      complexity: asInt(rawText.complexity, defaults.text.complexity, 1, 3),
      distortion: asInt(rawText.distortion, defaults.text.distortion, 1, 3)
    },
    turnstile: {
      siteKey: asString(rawTurnstile.siteKey, defaults.turnstile.siteKey).trim(),
      secretKey: asString(rawTurnstile.secretKey, defaults.turnstile.secretKey).trim()
    },
    maxFailures: asPositiveInt(input.maxFailures, defaults.maxFailures),
    banMinutes: asPositiveInt(input.banMinutes, defaults.banMinutes)
  };
}

export function loadConfig(plugins: PluginConfigService): EasyCaptchaConfig {
  return normalizeConfig(plugins.getConfig<unknown>('easy-captcha'));
}

export function saveConfig(plugins: PluginConfigService, config: EasyCaptchaConfig): void {
  plugins.setConfig('easy-captcha', config);
}

/**
 * 当前验证方式是否真正就绪：
 * - 文本验证码始终就绪；
 * - Turnstile 需要站点 ID 与密钥都非空。
 */
export function isMethodReady(config: EasyCaptchaConfig): boolean {
  if (config.method === 'turnstile') return Boolean(config.turnstile.siteKey && config.turnstile.secretKey);
  return true;
}

/** 从设置页表单构建配置（checkbox 为 on/undefined，数字为空回退默认）。 */
export function parseSettingsForm(body: Record<string, unknown>): EasyCaptchaConfig {
  const checkbox = (value: unknown): boolean => value === 'on' || value === '1' || value === true;
  const text = (value: unknown): string => String(value ?? '').trim();
  const int = (value: unknown, fallback: number, min: number, max: number): number => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const positive = (value: unknown, fallback: number): number => {
    const n = Math.floor(Number(value));
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return normalizeConfig({
    enabled: checkbox(body.enabled),
    method: text(body.method) === 'turnstile' ? 'turnstile' : 'text',
    protectLogin: checkbox(body.protect_login),
    protectRegister: checkbox(body.protect_register),
    protectComment: checkbox(body.protect_comment),
    text: {
      length: int(body.captcha_length, 4, 1, 8),
      charset: text(body.captcha_charset) === 'number' || text(body.captcha_charset) === 'letter' ? text(body.captcha_charset) : 'both',
      complexity: int(body.captcha_complexity, 1, 1, 3),
      distortion: int(body.captcha_distortion, 1, 1, 3)
    },
    turnstile: {
      siteKey: text(body.turnstile_site_key),
      secretKey: text(body.turnstile_secret_key)
    },
    maxFailures: positive(body.max_failures, 5),
    banMinutes: positive(body.ban_minutes, 10)
  });
}