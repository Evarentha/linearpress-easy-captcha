/*
 * Cloudflare Turnstile Server-Side Verifier
 *
 * Confirms Turnstile challenge tokens against Cloudflare's siteverify endpoint.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@gmail.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Cloudflare Turnstile server-side verification.
 *
 * <p>The front end sends back a token after passing the challenge; this module confirms its
 * validity by calling the siteverify endpoint with the site secret key. Whether a captcha is
 * shown at all is decided by Cloudflare (when Turnstile passes silently, no user action is
 * required).</p>
 *
 * @since 1.0.0
 */

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export interface TurnstileResult { success: boolean; }

export async function verifyTurnstile(secret: string, token: string, remoteIp?: string): Promise<TurnstileResult> {
  if (!secret || !token) return { success: false };
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: remoteIp ?? '' });
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000)
    });
    const data = await response.json() as { success?: boolean };
    return { success: Boolean(data.success) };
  } catch {
    // 网络异常按校验失败处理；不抛错以免把站点打挂。
    return { success: false };
  }
}