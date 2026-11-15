/*
 * Easy Captcha Client
 *
 * Refreshes the captcha image on demand; shows the right settings section for the chosen method.
 *
 * Authors:
 * MoyuZJ <moyuzj@evarentha.com> @LinearTeam - Made in China with ♥
 * worryzu <worryzu@evarentha.com> @LinearTeam
 *
 * Copyright (C) 2026 Evarentha
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(() => {
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-ec-refresh]');
    if (!button) return;
    const img = button.querySelector('[data-ec-img]');
    const url = new URL(img.src, location.href);
    url.searchParams.set('t', String(Date.now()));
    img.src = url.href;
    const input = button.closest('.ec-row')?.querySelector('input');
    if (input) { input.value = ''; input.focus(); }
  });

  // An image left open for a long time may have been replaced by another tab; refresh when the page comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    document.querySelectorAll('[data-ec-img]').forEach((img) => { if (Date.now() - (Number(img.dataset.loadedAt) || Date.now()) > 5 * 60_000) img.closest('[data-ec-refresh]')?.click(); });
  });
  document.querySelectorAll('[data-ec-img]').forEach((img) => { img.dataset.loadedAt = String(Date.now()); img.addEventListener('load', () => { img.dataset.loadedAt = String(Date.now()); }); });

  const radios = document.querySelectorAll('[data-ec-method]');
  if (radios.length) {
    const sync = () => {
      const method = [...radios].find((radio) => radio.checked)?.value;
      document.querySelectorAll('[data-ec-for]').forEach((section) => { section.hidden = section.dataset.ecFor !== method; });
    };
    radios.forEach((radio) => radio.addEventListener('change', sync));
    sync();
  }
})();
