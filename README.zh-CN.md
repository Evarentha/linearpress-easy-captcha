# 人机验证

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-easy-captcha.svg)](https://www.npmjs.com/package/@evarentha/linearpress-easy-captcha) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

[English](README.md) | **简体中文**

为 LinearPress 的登录、注册和访客评论加上人机验证。

## 功能

- 本站生成的图片验证码（不依赖外部服务），或 Cloudflare Turnstile。
- 可选择在登录、注册、访客评论时启用。
- 反复输错会暂停该 IP 一段时间，管理员可以解除。

## 入口

- `/admin/easy-captcha`：验证方式、启用位置、被暂停的地址

## 安装

LinearPress 4 已内置。在后台“插件”页启用或停用，立即生效，无需重启。其他安装方式：在 LinearPress 目录执行 `npm run sync -- easy-captcha`，或把本仓库放到 `src/plugins/easy-captcha`（目录名必须等于插件 id）。

需要 LinearPress ^4.0.0，支持 SQLite 和 MySQL。

## 许可

GPL-3.0-or-later，见 [LICENSE](LICENSE)。

源码：https://github.com/Evarentha/linearpress-easy-captcha
