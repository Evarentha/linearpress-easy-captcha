/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * 人机验证插件入口（Cordis 原生插件，export default 即 activate 阶段）。
 *
 * 功能：
 *  1. 普通文本验证码：PNG 位图（无依赖，内置笔画字体 + 手写 PNG 编码），
 *     复杂程度 / 变形程度 / 文本个数 / 文本类型可调；图片接口按 IP 限流 10 次/秒防滥用。
 *  2. Cloudflare Turnstile：站点 ID + 密钥，是否弹出验证码由 Cloudflare 决定。
 *  3. 覆盖登录 / 注册 / 评论三个场景；服务端中间件强制校验，绕过表单直接 POST 同样拦截。
 *  4. 验证码错误次数达到阈值（默认 5 次）即封禁该主体（默认 10 分钟），可调。
 *
 * 前端 UI 由 public/easy-captcha.js 动态注入（不覆盖主题视图，避免与其他插件冲突）；
 * 校验在 web.middleware 中强制执行，位于业务路由之前，与 advanced-user-management
 * 对 /login 的路由覆盖互不干扰。
 */

import { Context } from 'cordis';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { randomText, renderCaptchaPng } from './src/captcha.js';
import type { EasyCaptchaConfig } from './src/config.js';
import { isMethodReady, loadConfig, normalizeConfig, parseSettingsForm, saveConfig } from './src/config.js';
import type { CaptchaDb } from './src/store.js';
import { ensureSchema, formatBanRemaining, getAttempt, recordFailure, setBan, clearScope, sweepExpired } from './src/store.js';
import { verifyTurnstile } from './src/turnstile.js';
import { checkPermission, requireAuth } from '../../services/permission.service.js';

const PLUGIN_ID = 'easy-captcha';
const SETTINGS_URL = '/admin/easy-captcha';
const IMAGE_URL = '/plugins/easy-captcha/image';
const CONFIG_URL = '/plugins/easy-captcha/config';
const TURNSTILE_FIELD = 'cf-turnstile-response';
const CAPTCHA_FIELD = 'captcha_text';
const COMMENT_PATH_SUFFIX = '/comments';
const MANAGE_PERMISSION = 'plugin:manage';
/** 验证码图片接口限流：同一 IP 每秒最多 10 次请求（滑动窗口，防恶意刷图）。 */
const IMAGE_WINDOW_MS = 1000;
const IMAGE_MAX_HITS = 10;

type CaptchaRole = 'login' | 'register' | 'comment';
/** 校验结果：ok 是否通过；counted 是否计入错误次数（缺 token/缺答案不算"错误"）。 */
interface Verification { ok: boolean; counted: boolean; message: string; }

const text = (value: unknown): string => String(value ?? '').trim();
const param = (value: unknown): string => Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
const messageOf = (error: unknown): string => error instanceof Error ? error.message : '操作失败';
/** 页面处理器包装：失败时渲染 error 视图（与 Base wrap 语义一致）。 */
const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler => (req, res, next) => {
  void Promise.resolve(fn(req, res)).catch((error) => {
    console.error(`[${PLUGIN_ID}] handler error:`, error);
    if (!res.headersSent) res.status(500).render('error', { title: '服务器错误', message: messageOf(error) });
    else next(error);
  });
};

export default async function easyCaptcha(context: Context): Promise<void> {
  const { web, db, admin } = context.linearpress;
  const hooks = context.hooks;
  const plugins = context.plugins;
  const captchaDb = db as unknown as CaptchaDb;

  ensureSchema(captchaDb);
  let config: EasyCaptchaConfig = loadConfig(plugins);

  // ------------------------------------------------------------ 封禁主体
  /** 登录/注册按「用户名」，评论按「用户 ID / 游客 IP」——与需求"封禁该账号"对齐。 */
  function scopeFor(role: CaptchaRole, req: Request): string {
    if (role === 'comment') {
      if (req.session.userId) return `comment:u${req.session.userId}`;
      return `comment:ip:${String(req.ip ?? 'unknown')}`;
    }
    const username = text((req.body as Record<string, unknown>)?.username) || 'unknown';
    return `${role}:${username}`;
  }

  /** 校验请求携带的人机验证凭证。 */
  async function verifyRequest(req: Request): Promise<Verification> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (config.method === 'turnstile') {
      const token = text(body[TURNSTILE_FIELD]);
      if (!token) return { ok: false, counted: false, message: '请先完成人机验证。' };
      const result = await verifyTurnstile(config.turnstile.secretKey, token, String(req.ip ?? ''));
      return result.success
        ? { ok: true, counted: false, message: '' }
        : { ok: false, counted: true, message: '人机验证未通过，请重试。' };
    }
    const answer = text(body[CAPTCHA_FIELD]);
    const expected = req.session.easyCaptchaAnswer;
    if (!expected) return { ok: false, counted: false, message: '请先获取验证码。' };
    if (!answer) return { ok: false, counted: false, message: '请填写验证码。' };
    // 答案不区分大小写（验证码字符为字母数字）。
    if (answer.toLowerCase() === expected.toLowerCase()) return { ok: true, counted: false, message: '' };
    return { ok: false, counted: true, message: '验证码错误，请重试。' };
  }

  /** 校验失败/封禁时的响应呈现（与对应页面的 Base 行为同构）。 */
  function reject(res: Response, role: CaptchaRole, message: string): void {
    if (role === 'login') res.status(400).render('auth/login', { title: '登录', error: message });
    else if (role === 'register') res.status(400).render('auth/register', { title: '注册', error: message });
    else res.status(400).render('error', { title: '评论未提交', message });
  }

  // ------------------------------------------------------------ 强制校验中间件
  const captchaMiddleware: RequestHandler = async (req, res, next: NextFunction) => {
    if (!config.enabled || !isMethodReady(config)) return next();
    if (req.method !== 'POST') return next();
    const role: CaptchaRole | null = req.path === '/login' ? 'login'
      : req.path === '/register' ? 'register'
        : req.path.endsWith(COMMENT_PATH_SUFFIX) ? 'comment' : null;
    if (!role) return next();
    const protectedOk = role === 'login' ? config.protectLogin
      : role === 'register' ? config.protectRegister : config.protectComment;
    if (!protectedOk) return next();

    const scope = scopeFor(role, req);
    const now = Date.now();
    const attempt = getAttempt(captchaDb, scope);
    // 封禁中：即使验证码正确也拒绝（同 advanced-user-management 语义）。
    if (attempt.banUntil && attempt.banUntil > now) {
      return void reject(res, role, `人机验证错误次数过多，该账号已被暂时封禁，剩余约 ${formatBanRemaining(attempt.banUntil - now)} 后可重试。`);
    }
    if (attempt.banUntil && attempt.banUntil <= now) clearScope(captchaDb, scope); // 封禁到期，计数清零

    const result = await verifyRequest(req);
    if (result.ok) {
      delete req.session.easyCaptchaAnswer;
      clearScope(captchaDb, scope);
      return next();
    }
    if (!result.counted) return void reject(res, role, result.message);

    const fails = recordFailure(captchaDb, scope);
    if (fails >= config.maxFailures) {
      setBan(captchaDb, scope, now + config.banMinutes * 60 * 1000);
      return void reject(res, role, `人机验证错误次数过多，该账号已被暂时封禁 ${config.banMinutes} 分钟，请稍后再试。`);
    }
    return void reject(res, role, `${result.message}（还可尝试 ${config.maxFailures - fails} 次）。`);
  };
  web.middleware(captchaMiddleware);

  // ------------------------------------------------------------ 验证码图片（文本模式）
  // 限流滑动窗口：同一 IP 每秒最多 IMAGE_MAX_HITS 次；超限返回 429（前端 JS 会提示稍后刷新）。
  const imageHits = new Map<string, number[]>();
  const isImageRateLimited = (ip: string, now: number): boolean => {
    const hits = (imageHits.get(ip) ?? []).filter((t) => now - t < IMAGE_WINDOW_MS);
    if (hits.length >= IMAGE_MAX_HITS) { imageHits.set(ip, hits); return true; }
    hits.push(now); imageHits.set(ip, hits);
    if (imageHits.size > 5000) for (const [key, times] of imageHits) if (!times.some((t) => now - t < IMAGE_WINDOW_MS)) imageHits.delete(key);
    return false;
  };
  web.register('get', IMAGE_URL, (req: Request, res: Response) => {
    if (isImageRateLimited(String(req.ip ?? 'unknown'), Date.now())) {
      return void res.status(429).type('text/plain; charset=utf-8').send('验证码请求过于频繁，请稍后再试。');
    }
    const answer = randomText(config.text);
    req.session.easyCaptchaAnswer = answer;
    res.type('image/png').set('Cache-Control', 'no-store, no-cache, must-revalidate').send(renderCaptchaPng(answer, config.text));
  });

  // ------------------------------------------------------------ 前端配置（不含密钥）
  web.register('get', CONFIG_URL, (_req: Request, res: Response) => {
    res.json({
      enabled: config.enabled && isMethodReady(config),
      method: config.method,
      siteKey: config.method === 'turnstile' ? config.turnstile.siteKey : '',
      protectLogin: config.protectLogin,
      protectRegister: config.protectRegister,
      protectComment: config.protectComment
    });
  });

  // ------------------------------------------------------------ 后台设置页
  const settingsView: RequestHandler = wrap(async (_req, res) => {
    res.render('admin/easy-captcha', {
      title: '人机验证 · 设置',
      config,
      ready: isMethodReady(config),
      settingsUrl: SETTINGS_URL,
      notice: param(_req.query.notice)
    });
  });
  const settingsSave: RequestHandler = wrap(async (req, res) => {
    try {
      const next = parseSettingsForm((req.body ?? {}) as Record<string, unknown>);
      saveConfig(plugins, next);
      config = next;
      res.redirect(`${SETTINGS_URL}?notice=saved`);
    } catch (error) {
      res.status(400).render('admin/easy-captcha', { title: '人机验证 · 设置', config, ready: isMethodReady(config), settingsUrl: SETTINGS_URL, notice: `保存失败：${messageOf(error)}` });
    }
  });
  const settingsReset: RequestHandler = wrap(async (_req, res) => {
    const defaults = normalizeConfig(undefined);
    saveConfig(plugins, defaults);
    config = defaults;
    res.redirect(`${SETTINGS_URL}?notice=reset`);
  });
  web.register('get', SETTINGS_URL, requireAuth, checkPermission(MANAGE_PERMISSION), settingsView);
  web.register('post', SETTINGS_URL, requireAuth, checkPermission(MANAGE_PERMISSION), settingsSave);
  web.register('post', `${SETTINGS_URL}/reset`, requireAuth, checkPermission(MANAGE_PERMISSION), settingsReset);

  // 后台扩展：侧栏菜单 + 插件列表设置入口
  hooks.on('admin:menu', (menu: Array<{ title: string; link: string }>) => [...menu, { title: '人机验证', link: SETTINGS_URL }]);
  admin.registerCustomSetting({ label: '人机验证设置', link: SETTINGS_URL });

  // ------------------------------------------------------------ 定时清理（Effect 自动释放）
  context.effect(() => {
    const timer = setInterval(() => {
      try { sweepExpired(captchaDb, Date.now()); }
      catch (error) { console.error(`[${PLUGIN_ID}] sweep failed:`, error); }
    }, 60 * 60 * 1000);
    timer.unref?.();
    return () => clearInterval(timer);
  });

  context.logger.info(`activated (method=${config.method}, enabled=${config.enabled}, maxFailures=${config.maxFailures}, banMinutes=${config.banMinutes})`);
}