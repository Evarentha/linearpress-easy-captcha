/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

# Easy Captcha（人机验证）

为登录、注册与评论提供人机验证，验证方式二选一：

- **普通文本验证码**：服务端生成 PNG 位图（内置笔画字体 + 手写 PNG 编码，无外部依赖）。
  图片的复杂程度（干扰点/干扰线数量）、变形程度（字符旋转/倾斜/位移）、文本个数（字符数）
  与文本类型（仅数字 / 仅英文字母 / 两者）均可调节；图片接口按 IP 限流 10 次/秒防滥用。
- **Cloudflare Turnstile**：填入站点 ID（Site Key）与密钥（Secret Key）后，是否弹出验证码由 Cloudflare 决定。

启用后，登录、注册、评论（任何人）在提交时都必须通过人机验证；校验在服务端中间件强制执行，
绕过表单前端直接 POST 同样会被拦截。

## 错误次数与封禁

验证码错误次数达到上限（默认 5 次）即封禁该主体 10 分钟：

- 登录：按「用户名」封禁；
- 注册：按「尝试注册的用户名」封禁；
- 评论：登录用户按「用户 ID」封禁，游客按「来源 IP」封禁。

错误次数上限与封禁时长均可在插件设置中调整；验证码输入正确会清零对应计数。

## 使用方式

1. 在 `Plugins/` 工作区开发，`npm run sync` 同步到 `src/plugins/easy-captcha`。
2. 后台「插件」页启用本插件。
3. 打开「人机验证」设置页：选择验证方式、配置参数并保存（无需重启，即时生效）。

Turnstile 需要在 [Cloudflare Dashboard](https://dash.cloudflare.com/) 创建站点并获取 Site Key / Secret Key。

## 目录结构

```text
easy-captcha/
├── index.ts                # 入口（Cordis 插件，activate 阶段）
├── plugin.json             # 清单
├── types/session.d.ts      # Session 扩展声明（验证码答案）
├── src/
│   ├── captcha.ts          # SVG 文本验证码生成
│   ├── config.ts           # 配置模型：默认值 + 归一化 + 读写
│   ├── store.ts            # 错误计数 / 封禁记录（基础设施 SQLite）
│   └── turnstile.ts        # Cloudflare Turnstile siteverify
├── public/                 # 前端注入脚本与样式
│   ├── easy-captcha.css
│   └── easy-captcha.js
└── views/admin/            # 后台设置页
    └── easy-captcha.ejs
```