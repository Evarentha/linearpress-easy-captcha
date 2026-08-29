<!--
  Author: MoyuZJ
  Team: LinearTeam
  Contact: linearteam@foxmail.com
  Made by MoyuZJ in China with ♥
-->

# 人机验证（easy-captcha）

为 LinearPress 的**登录、注册与评论**提供人机验证：普通 PNG 文本验证码（服务端生成，零依赖）
或 **Cloudflare Turnstile**；验证码错误次数超限自动阶梯封禁。

> 本仓库是 LinearPress 插件 **easy-captcha** 的独立开发仓库。插件即 Cordis 插件函数，即插即用、可停用可卸载。

## 插件化的优势

- **中间件强制校验**：校验在服务端中间件执行，隔着表单直接 POST 同样被拦截；不需要改核心认证/评论路由。
- **前端免改造**：验证码 UI 由注入的脚本按 `form[action=…]` 自动挂到登录/注册/评论表单，主题只要保证表单里有提交按钮锚点即可（Fluent 主题等已兼容）。
- **可叠加 2FA/SSO**：与 easy-2fa、oidc-sso 走不同路由/时序，互不冲突（SSO 回调不经人机验证）。

## 功能

- **普通文本验证码**：服务端生成 PNG（内置笔画字体 + 手写 PNG 编码，无外部依赖），复杂度（干扰点/线）、变形（旋转/倾斜/位移）、字符数与字符集（数字/字母/混合）均可调；图片接口按 IP 限流 10 次/秒。
- **Cloudflare Turnstile**：填 Site Key / Secret Key 后由 Cloudflare 决定是否弹出验证码。
- **错误次数与封禁**：默认错误 5 次封禁 10 分钟——登录按用户名、注册按注册名、评论登录用户按 ID / 游客按 IP；上限与时长后台可调，输入正确清零计数。

## 安装

```bash
# 方式一：工作区同步
cd base && sh scripts/sync-plugins.sh easy-captcha

# 方式二：克隆到运行目录（目录名必须等于插件 id）
git clone <本仓库地址> src/plugins/easy-captcha
```

启用后进入后台「人机验证」设置页配置（无需重启，即时生效）。Turnstile 需到 [Cloudflare Dashboard](https://dash.cloudflare.com/) 创建站点获取密钥。

## 本地开发：怎么拉 / 怎么改 / 怎么跑

```bash
git clone <本仓库地址> LinearPress/Plugins/easy-captcha
cd LinearPress/base
npm install && npm run db:init
sh scripts/sync-plugins.sh easy-captcha
npm run dev
```

## 目录结构

```text
easy-captcha/
├── index.ts                # 入口（Cordis 插件，activate 阶段）
├── plugin.json             # 清单
├── types/session.d.ts      # Session 扩展声明（验证码答案）
├── src/
│   ├── captcha.ts          # PNG 文本验证码生成
│   ├── config.ts           # 配置模型：默认值 + 归一化 + 读写
│   ├── store.ts            # 错误计数 / 封禁记录（基础设施 SQLite）
│   └── turnstile.ts        # Cloudflare Turnstile siteverify
├── public/                 # 前端注入脚本与样式
└── views/admin/            # 后台设置页
```

## 贡献与发布

- conventional commits；提交前 `cd base && npm run typecheck`
- 版本：`git tag v1.0.0 && git push --tags`
- License：MIT（见仓库 LICENSE）