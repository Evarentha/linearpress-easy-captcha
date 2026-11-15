/*
 * Easy Captcha Plugin Entry Point
 *
 * Human verification for sign-in, registration and guest comments: an image captcha or Cloudflare Turnstile.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * <p>Verification is a guard in the core auth flow, so every way into
 * sign-in, registration or commenting is covered (including other plugins'
 * login pages) and errors show next to the field. The widget is rendered by
 * the server into the form slots; signed-in users are never asked when
 * commenting.</p>
 * <p>Each captcha image answers one attempt only, and repeated wrong answers
 * lock out the IP (not the account) for a while.</p>
 *
 * @since 1.0.0
 */

import type { Context } from 'cordis';
import { checkPermission, requireAuth, route, esc } from 'linearpress/plugin-api';
import type { FlowKind } from 'linearpress/plugin-api';
import { randomText, renderCaptchaPng } from './src/captcha.js';
import { isMethodReady, normalizeConfig, parseSettingsForm, type EasyCaptchaConfig } from './src/config.js';
import { clearScope, ensureSchema, formatRemaining, getAttempt, recordFailure, setBan, sweepExpired } from './src/store.js';
import { verifyTurnstile } from './src/turnstile.js';

const PLUGIN_ID = 'easy-captcha';
const SETTINGS = '/admin/easy-captcha';
const IMAGE = '/easy-captcha/image';
const FIELD = 'captcha_text';
const TURNSTILE_FIELD = 'cf-turnstile-response';
const KINDS: FlowKind[] = ['login', 'register', 'comment'];
const FAILURE_WINDOW = 60 * 60_000;

declare module 'express-session' {
  interface SessionData { easyCaptcha?: Partial<Record<FlowKind, string>>; }
}

export default async function easyCaptcha(ctx: Context): Promise<void> {
  const { web, ui, admin, auth } = ctx.linearpress;
  const db = () => ctx.databaseService;
  await ensureSchema(db());
  let config: EasyCaptchaConfig = normalizeConfig(await ctx.plugins.getConfig(PLUGIN_ID));
  const active = (kind: FlowKind) => config.enabled && isMethodReady(config) && (kind === 'login' ? config.protectLogin : kind === 'register' ? config.protectRegister : config.protectComment);

  /* ---------- verification (core auth guard) ---------- */
  auth.guard(KINDS, {
    id: PLUGIN_ID,
    order: 10,
    async before({ kind, req, ip, fields, user }) {
      if (!active(kind) || (kind === 'comment' && user)) return;
      const scope = `ip:${ip}`;
      const now = Date.now();
      const attempt = await getAttempt(db(), scope);
      if (attempt.banUntil && attempt.banUntil > now) return { deny: `验证失败次数过多，请 ${formatRemaining(attempt.banUntil - now)}后再试`, status: 429 };

      let ok = false;
      if (config.method === 'turnstile') {
        const token = String(fields[TURNSTILE_FIELD] ?? '').trim();
        if (!token) return { deny: '请先完成人机验证', field: FIELD };
        ok = (await verifyTurnstile(config.turnstile.secretKey, token, ip)).success;
      } else {
        const expected = req.session.easyCaptcha?.[kind];
        const answer = String(fields[FIELD] ?? '').trim();
        // One image, one attempt: the answer is consumed whether right or wrong.
        if (req.session.easyCaptcha) delete req.session.easyCaptcha[kind];
        if (!expected) return { deny: '验证码已过期，请看新的验证码重新输入', field: FIELD };
        if (!answer) return { deny: '请输入图中的字符', field: FIELD };
        ok = answer.toLowerCase() === expected.toLowerCase();
      }
      if (ok) { if (attempt.fails) await clearScope(db(), scope); return; }

      const fails = await recordFailure(db(), scope, now, FAILURE_WINDOW);
      if (fails >= config.maxFailures) {
        await setBan(db(), scope, now + config.banMinutes * 60_000);
        return { deny: `验证失败次数过多，请 ${config.banMinutes} 分钟后再试`, status: 429 };
      }
      const left = config.maxFailures - fails;
      return { deny: config.method === 'turnstile' ? '人机验证没有通过，请重试' : `验证码不正确${left <= 2 ? `，还可以再试 ${left} 次` : ''}`, field: FIELD };
    }
  });

  /* ---------- widget ---------- */
  const widget = (kind: FlowKind) => ({ args, locals }: { args: Record<string, unknown>; locals: Record<string, unknown> }) => {
    if (!active(kind) || (kind === 'comment' && locals.currentUser)) return '';
    const form = args.form as { errors?: Record<string, string> } | undefined;
    const error = form?.errors?.[FIELD];
    if (config.method === 'turnstile') {
      return `<div class="field ec-field${error ? ' has-error' : ''}" data-lp-plugin="${PLUGIN_ID}"><div class="cf-turnstile" data-sitekey="${esc(config.turnstile.siteKey)}" data-language="zh-cn" data-theme="auto"></div>${error ? `<p class="error">${esc(error)}</p>` : ''}<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script></div>`;
    }
    const id = `ec-${kind}`;
    return `<div class="field ec-field${error ? ' has-error' : ''}" data-lp-plugin="${PLUGIN_ID}">
      <label for="${id}" class="required">验证码</label>
      <div class="ec-row">
        <input class="input" id="${id}" name="${FIELD}" inputmode="${config.text.charset === 'number' ? 'numeric' : 'text'}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="${config.text.length}" required${error ? ` aria-invalid="true" aria-describedby="${id}-error"` : ''}>
        <button type="button" class="ec-image" data-ec-refresh title="看不清？换一张" aria-label="验证码图片，点击换一张"><img src="${IMAGE}?for=${kind}&amp;t=${Date.now()}" alt="验证码" width="120" height="40" data-ec-img></button>
      </div>
      ${error ? `<p class="error" id="${id}-error">${esc(error)}</p>` : '<p class="help">不区分大小写，看不清可以点图片换一张。</p>'}
    </div>`;
  };
  ui.slot('auth.login.fields', { render: widget('login'), order: 90 });
  ui.slot('auth.register.fields', { render: widget('register'), order: 90 });
  ui.slot('comment.form.fields', { render: widget('comment'), order: 90 });

  /* ---------- image ---------- */
  const hits = new Map<string, number[]>();
  web.register('get', IMAGE, (req, res) => {
    const now = Date.now();
    const ip = String(req.ip ?? '');
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 10_000);
    if (recent.length >= 20) return void res.status(429).type('text/plain; charset=utf-8').send('刷新太频繁，请稍后再试');
    recent.push(now); hits.set(ip, recent);
    if (hits.size > 5000) for (const [key, times] of hits) if (!times.some((t) => now - t < 10_000)) hits.delete(key);
    const kind = KINDS.find((value) => value === req.query.for) ?? 'login';
    const answer = randomText(config.text);
    req.session.easyCaptcha = { ...(req.session.easyCaptcha ?? {}), [kind]: answer };
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).type('image/png').send(renderCaptchaPng(answer, config.text));
  });

  /* ---------- settings ---------- */
  admin.registerSettings({ label: '人机验证', link: SETTINGS, description: '登录、注册和访客评论时的验证码' });
  const manage = [requireAuth, checkPermission('plugin:manage')];
  web.register('get', SETTINGS, ...manage, route(async (_req, res) => {
    res.render(`${PLUGIN_ID}/settings`, { pageTitle: '人机验证', crumbs: [{ title: '设置', href: '/admin/settings' }], config, ready: isMethodReady(config), hasSecret: Boolean(config.turnstile.secretKey), image: IMAGE });
  }));
  web.register('post', SETTINGS, ...manage, route(async (req, res) => {
    const next = parseSettingsForm(req.body ?? {});
    if (!next.turnstile.secretKey) next.turnstile.secretKey = config.turnstile.secretKey; // blank keeps the saved secret
    if (req.body.clear_secret === 'on') next.turnstile.secretKey = '';
    config = next;
    await ctx.plugins.setConfig(PLUGIN_ID, config);
    if (config.enabled && !isMethodReady(config)) req.flash('warning', '已保存，但 Turnstile 还缺少站点 ID 或密钥，补全之前不会启用验证。');
    else req.flash('success', config.enabled ? '设置已保存，立即生效。' : '已保存。人机验证目前是关闭的。');
    res.redirect(303, SETTINGS);
  }));
  web.register('post', `${SETTINGS}/unban`, ...manage, route(async (req, res) => {
    await db().run('DELETE FROM ec_attempts');
    req.flash('success', '已解除所有临时封禁。');
    res.redirect(303, SETTINGS);
  }));

  ctx.effect(() => {
    const timer = setInterval(() => { void sweepExpired(db(), Date.now()).catch(() => undefined); }, 3600_000);
    timer.unref?.();
    return () => clearInterval(timer);
  });
  ctx.logger.info(`activated (method=${config.method}, enabled=${config.enabled})`);
}

