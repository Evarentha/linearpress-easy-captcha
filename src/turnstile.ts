/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

/**
 * Cloudflare Turnstile 服务端校验。
 *
 * 前端 token 通过挑战后回传，此处以站点密钥调用 siteverify 接口确认有效性。
 * 是否弹出验证码由 Cloudflare 决定（Turnstile 无感通过时不要求用户操作）。
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
      body
    });
    const data = await response.json() as { success?: boolean };
    return { success: Boolean(data.success) };
  } catch {
    // 网络异常按校验失败处理；不抛错以免把站点打挂。
    return { success: false };
  }
}