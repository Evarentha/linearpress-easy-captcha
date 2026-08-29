<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 人机验证 · Easy Captcha

Human-verification for LinearPress **login, registration and comments**：server-generated PNG text captcha（zero dependencies）or **Cloudflare Turnstile**; too many failures triggers a temporary ban.

为 LinearPress 的**登录、注册与评论**提供人机验证：普通 PNG 文本验证码（服务端生成，零依赖）或 **Cloudflare Turnstile**；错误次数超限自动临时封禁。

> Independent plugin repository for LinearPress **easy-captcha**. A plugin is a Cordis plugin function — install on demand, disable/uninstall cleanly.
> 本仓库是 LinearPress 插件 **easy-captcha** 的独立仓库。

## Why Plugins? / 插件化的优势

- **Enforced by middleware** —— verification runs server-side; direct POSTs without the form are also blocked; core auth/comment routes untouched.
  **中间件强制校验**——绕过表单直接 POST 同样被拦截，核心路由不动。
- **Zero front-end rework** —— the injected script attaches the captcha UI to login/register/comment forms automatically; any theme just needs a submit-button anchor.
  **前端免改造**——脚本按 `form[action=…]` 自动挂载验证码。
- **Stacks with 2FA/SSO** —— different routes/timing, no conflicts（SSO callbacks skip captcha）.
  **可叠加 2FA/SSO**——不同路由时序，互不冲突。

## Features / 功能

- **PNG text captcha / 文本验证码**：server-side PNG generation（built-in strokes font + hand-written PNG encoder, no deps）；complexity / distortion / length / charset all adjustable；image endpoint rate-limited 10 req/s per IP.
- **Cloudflare Turnstile**：fill Site Key / Secret Key; Cloudflare decides whether to show the challenge.
- **Failures & bans / 错误次数与封禁**：default 5 failures → 10-min ban（login by username, register by attempted name, comment by user id or guest IP）；limits adjustable，correct input resets the counter.

## Install / 安装

```bash
# Option 1 — workspace sync（工作区同步）
cd base && sh scripts/sync-plugins.sh easy-captcha

# Option 2 — clone into runtime dir（目录名必须等于插件 id）
git clone https://github.com/Averithen/linearpress-easy-captcha src/plugins/easy-captcha
```

Configure via admin「人机验证」page（applies instantly）. Turnstile keys from [Cloudflare Dashboard](https://dash.cloudflare.com/).

## Local Development / 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone https://github.com/Averithen/linearpress-easy-captcha LinearPress/Plugins/easy-captcha
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh easy-captcha
npm run dev
```

## Directory / 目录结构

```text
easy-captcha/
├── index.ts                entry（Cordis plugin，activate phase）
├── plugin.json             manifest
├── types/session.d.ts      session extension（captcha answer）
├── src/
│   ├── captcha.ts          PNG text captcha generation
│   ├── config.ts           config model & persistence
│   ├── store.ts            failure counters / bans（infrastructure SQLite）
│   └── turnstile.ts        Cloudflare siteverify
├── public/                 injected front-end script & styles
└── views/admin/            settings page
```

## Contribute & Release / 贡献与发布

- conventional commits；`cd base && npm run typecheck` before commit
- Version：`git tag v1.0.0 && git push --tags`
- License：MIT（LICENSE）