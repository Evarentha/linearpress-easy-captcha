/*
 * Express Session Type Augmentation
 *
 * Adds the text-captcha answer field to express-session's SessionData type.
 *
 * Authors:
 * MoyuZJ <moyuzj@moyuzj.cn> @LinearTeam - Made in China with ♥
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/**
 * Type declarations augmenting the express-session module for the easy-captcha plugin.
 *
 * <p>Adds the optional <code>easyCaptchaAnswer</code> field to SessionData: written when the
 * captcha image is generated and deleted once verification succeeds, so the answer never leaves
 * the server-side session.</p>
 *
 * @since 1.0.0
 */

import 'express-session';
declare module 'express-session' {
  interface SessionData {
    /** 普通文本验证码的答案（图片生成时写入，校验通过后清除）。 */
    easyCaptchaAnswer?: string;
  }
}