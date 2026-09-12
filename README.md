# Easy Captcha

[![LinearPress](https://img.shields.io/badge/LinearPress-plugin-7C3AED.svg)](https://www.npmjs.com/package/@evarentha/linearpress) [![npm](https://img.shields.io/npm/v/@evarentha/linearpress-easy-captcha.svg)](https://www.npmjs.com/package/@evarentha/linearpress-easy-captcha) [![Node.js](https://img.shields.io/badge/node-%3E%3D22-green.svg)](https://nodejs.org) [![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue.svg)](https://www.typescriptlang.org) [![License: GPL-3.0-or-later](https://img.shields.io/badge/License-GPL--3.0--or--later-blue.svg)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

Human verification for LinearPress logins, registrations, and comment submissions. Two methods: a built-in PNG text captcha with zero dependencies, or Cloudflare Turnstile. Enforcement runs in server-side middleware, so posting straight at an endpoint without the form is blocked all the same, and repeated wrong answers escalate into temporary bans.

## Install

```bash
git clone https://github.com/Evarentha/linearpress-easy-captcha.git src/plugins/easy-captcha
```

The directory name must equal the plugin id. Restart afterwards, or sync from the `base` checkout (`sh scripts/sync-plugins.sh easy-captcha`), or upload the ZIP / npm name from the admin Plugins page. The built-in captcha needs no external service; Turnstile needs a site key and secret key from the Cloudflare dashboard.

## How it works

After too many wrong answers (five by default) the subject is banned for a configurable window (10 minutes by default), and during the ban even correct answers are rejected. Login and registration count attempts by the submitted username; comments count by user id, or by IP for guests. A correct answer clears the counter, and counters expire on their own after 24 hours of inactivity.

The expected answer never leaves the server: it is kept in the visitor's session, and only the rendered image is public. The image endpoint is rate-limited to 10 requests per second per IP. The built-in captcha renders a 5x7 stroke font into a pixel buffer through a hand-rolled PNG encoder; length (1-8), charset (numbers, letters, or both), and complexity and distortion levels (each 1-3) are all configurable. With Turnstile, Cloudflare decides when visitors get challenged, the siteverify call has a 10-second timeout, and it fails closed: if Cloudflare cannot be reached, verification does not silently pass.

The UI is injected client-side onto the existing login, registration, and comment forms (matched by `form[action=...]`), wrapped in a `.ec-box` element the plugin styles itself. There are no theme view overrides, so it works with any theme, Fluent included; a theme only needs a submit button inside the form.

## Settings

The settings page lives at `/admin/easy-captcha`, guarded by the base `plugin:manage` permission (the plugin defines none of its own). Pick the method, tune the text captcha, set the wrong-answer threshold and ban duration, and fill in the Turnstile keys. The site key is published at `GET /plugins/easy-captcha/config` for the widget; the Secret Key never leaves the server and is never echoed back on the settings page, and leaving the field blank keeps the saved value.

Wrong-answer counters and ban records live in `ec_attempts`, a table in the local infrastructure SQLite, so captcha state survives a swap of the main database driver, a move to MySQL for example. Verification happens ahead of the login, registration, and comment handlers, which lets it compose with other plugins on those flows: easy-2fa and oidc-sso work on different routes and timings, and SSO callbacks never pass through the captcha.

## License

GPL-3.0-or-later, Copyright (C) 2026 Evarentha. See LICENSE.
