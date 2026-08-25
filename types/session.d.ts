/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

import 'express-session';
declare module 'express-session' {
  interface SessionData {
    /** 普通文本验证码的答案（图片生成时写入，校验通过后清除）。 */
    easyCaptchaAnswer?: string;
  }
}