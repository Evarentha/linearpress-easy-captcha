# 人机验证（easy-captcha）

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-easy-captcha.svg)](https://www.npmjs.com/package/@evarentha/linearpress-easy-captcha) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 的登录、注册与评论提交提供人机验证。支持两种方式：零依赖的内置 PNG 文字验证码，或 Cloudflare Turnstile。校验运行于服务端中间件，绕过表单直接请求接口同样会被拦截，答错次数超限将升级为临时封禁。

## 安装

```bash
git clone https://github.com/Evarentha/linearpress-easy-captcha.git src/plugins/easy-captcha
```

目录名必须与插件 id 一致，安装后需重启 LinearPress。也可以在 `base` 检出中执行 `sh scripts/sync-plugins.sh easy-captcha`，或在后台插件页上传 ZIP、填写 npm 包名。内置验证码不需要任何外部服务；Turnstile 需要 Cloudflare 后台签发的站点密钥（Site Key）与机密密钥（Secret Key）。

## 工作方式

答错次数达到阈值（默认 5 次）后，该主体将被封禁一段可配置的时间（默认 10 分钟），封禁期内即使答案正确亦予拒绝。登录与注册按提交的用户名计数；评论按用户 id 计数，游客按 IP。答对即清零计数，24 小时无活动后计数自动过期。

正确答案始终不会离开服务器：存储于访客会话，公开的仅为渲染出的图片，图片接口同时限流为每 IP 每秒 10 次。内置验证码以 5x7 笔画字体渲染至像素缓冲，再经自行实现的 PNG 编码器输出；字符数（1-8）、字符集（纯数字 / 纯字母 / 混合）、复杂度与变形（各 1-3 档）均可配置。使用 Turnstile 时，是否弹出挑战由 Cloudflare 决定；siteverify 调用设有 10 秒超时并按失败关闭处理：无法联系 Cloudflare 时，验证不会静默放行。

界面由前端脚本注入至现有的登录、注册、评论表单（按 `form[action=...]` 匹配），封装于由本插件自行适配样式的 `.ec-box` 元素中；不覆盖任何主题视图，因此兼容包括 Fluent 在内的所有主题；主题仅需在表单内提供提交按钮。

## 设置

设置页位于 `/admin/easy-captcha`，由基础权限 `plugin:manage` 守护（本插件不自定义权限）。可选择验证方式、调整文字验证码参数、设置答错阈值与封禁时长、填写 Turnstile 密钥。站点密钥经 `GET /plugins/easy-captcha/config` 发布给前端组件；机密密钥（Secret Key）永不离开服务器、设置页亦不回显，留空即保留已存值。

答错计数与封禁记录存储于本地基础设施 SQLite 的 `ec_attempts` 表，因此更换主数据库驱动（例如迁移至 MySQL）不影响人机验证状态。校验发生在登录、注册、评论处理器之前，可与其他插件在这些流程上共存：easy-2fa 与 oidc-sso 使用不同的路由与时序，SSO 回调不经过人机验证。

## 许可证

本项目以 GPL-3.0-or-later 许可发布，Copyright (C) 2026 Evarentha，完整文本见 [LICENSE](LICENSE)。
