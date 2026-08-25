/*
 * Author: MoyuZJ
 * Team: LinearTeam
 * Contact: linearteam@foxmail.com
 * Made by MoyuZJ in China with ♥
 */

(() => {
  'use strict';

  const CONFIG_URL = '/plugins/easy-captcha/config';
  const IMAGE_URL = '/plugins/easy-captcha/image';
  const TURNSTILE_FIELD = 'cf-turnstile-response';
  const CAPTCHA_FIELD = 'captcha_text';
  const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

  let config = null;

  /* ---------------- 初始化：读取公开配置（不含密钥） ---------------- */
  async function init() {
    try {
      const response = await fetch(CONFIG_URL, { headers: { accept: 'application/json' } });
      if (!response.ok) return;
      config = await response.json();
    } catch {
      return; // 配置接口不可用时静默退出，校验仍由服务端中间件强制执行
    }
    if (!config || !config.enabled) return;

    const selectors = [];
    if (config.protectLogin) selectors.push('form[action="/login"]');
    if (config.protectRegister) selectors.push('form[action="/register"]');
    if (config.protectComment) selectors.push('form[action$="/comments"]');
    if (!selectors.length) return;

    const forms = Array.from(document.querySelectorAll(selectors.join(',')));
    forms.forEach(attach);
  }

  function attach(form) {
    if (form.querySelector('.ec-box')) return;
    const submit = form.querySelector('button[type="submit"], .button[type="submit"], button, .button') || null;
    if (config.method === 'turnstile') attachTurnstile(form, submit);
    else attachText(form, submit);
  }

  /* ---------------- 普通文本验证码 ---------------- */
  function attachText(form, submit) {
    const box = document.createElement('div');
    box.className = 'ec-box ec-text';
    box.innerHTML =
      '<div class="ec-row">' +
        '<img class="ec-image" alt="验证码" title="点击刷新" ' +
          'src="' + IMAGE_URL + '?t=' + Date.now() + '">' +
        '<button type="button" class="ec-refresh">换一张</button>' +
      '</div>' +
      '<p class="ec-hint" hidden>验证码加载失败，请稍后点击「换一张」重试。</p>' +
      '<input class="ec-input" name="' + CAPTCHA_FIELD + '" placeholder="请输入图中验证码" autocomplete="off" spellcheck="false" required>';
    const img = box.querySelector('.ec-image');
    const hint = box.querySelector('.ec-hint');
    const refresh = box.querySelector('.ec-refresh');

    function reload() {
      img.src = IMAGE_URL + '?t=' + Date.now();
      hint.hidden = true;
      img.classList.remove('ec-error');
    }
    refresh.addEventListener('click', (event) => { event.preventDefault(); reload(); });
    img.addEventListener('click', reload);
    // 图片加载失败（如触发限流 429）时给出提示，不阻止提交（服务端会给出明确错误）。
    img.addEventListener('error', () => {
      img.classList.add('ec-error');
      hint.hidden = false;
    });

    if (submit) form.insertBefore(box, submit);
    else form.appendChild(box);
  }

  /* ---------------- Cloudflare Turnstile ---------------- */
  function attachTurnstile(form, submit) {
    const box = document.createElement('div');
    box.className = 'ec-box ec-turnstile';
    box.innerHTML =
      '<div class="ec-turnstile-widget" data-ec-sitekey=""></div>' +
      '<input type="hidden" name="' + TURNSTILE_FIELD + '">' +
      '<p class="ec-hint">请完成人机验证后提交。</p>';
    const widget = box.querySelector('.ec-turnstile-widget');
    const hidden = box.querySelector('input[name="' + TURNSTILE_FIELD + '"]');

    if (submit) form.insertBefore(box, submit);
    else form.appendChild(box);

    loadTurnstileScript()
      .then(() => {
        if (!window.turnstile || widget.dataset.rendered) return;
        widget.dataset.rendered = '1';
        try {
          window.turnstile.render(widget, { sitekey: config.siteKey, theme: 'light' });
        } catch {
          // 渲染失败（如 Site Key 无效）不阻塞表单；服务端校验会拦截。
        }
      })
      .catch(() => { /* 脚本加载失败同上 */ });

    // 提交前把 token 写入隐藏字段；未完成挑战时阻止提交并提示。
    form.addEventListener('submit', (event) => {
      const token = window.turnstile ? (window.turnstile.getResponse(widget) || '') : '';
      if (!token) { event.preventDefault(); box.querySelector('.ec-hint').hidden = false; return; }
      hidden.value = token;
    });
  }

  let turnstilePromise = null;
  function loadTurnstileScript() {
    if (window.turnstile) return Promise.resolve();
    if (turnstilePromise) return turnstilePromise;
    turnstilePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('turnstile script load failed'));
      document.head.appendChild(script);
    });
    return turnstilePromise;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();