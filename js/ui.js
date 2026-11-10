// Small DOM/formatting helpers shared by all views.
import { parseISO, daysBetween } from './dates.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const fmtCache = new Map();
function fmt(opts) {
  const k = JSON.stringify(opts);
  if (!fmtCache.has(k)) fmtCache.set(k, new Intl.DateTimeFormat(undefined, { timeZone: 'UTC', ...opts }));
  return fmtCache.get(k);
}

/** "Thu, Dec 10" (adds the year when it differs from today's year). */
export function fmtDate(iso, { year } = {}) {
  if (!iso) return '';
  const d = parseISO(iso);
  const showYear = year ?? d.getUTCFullYear() !== new Date().getFullYear();
  return fmt({ weekday: 'short', month: 'short', day: 'numeric', ...(showYear ? { year: 'numeric' } : {}) }).format(d);
}

export function fmtRange(start, end) {
  if (!start) return 'No date';
  if (!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

export function relDays(due, today) {
  if (!due) return '';
  const n = daysBetween(today, due);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return '1 day overdue';
  if (n < 0) return `${-n} days overdue`;
  return `in ${n} days`;
}

export function money(n) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(n) || 0);
}

export const icons = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.9" fill="currentColor"/><circle cx="12" cy="12" r="1.9" fill="currentColor"/><circle cx="19" cy="12" r="1.9" fill="currentColor"/></svg>',
  warn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l10 18H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v5M12 18v.01" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

// ---- toast ------------------------------------------------------------------

let toastTimer;
export function toast(message, { undo, duration = 4000 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = `<span>${esc(message)}</span>${undo ? '<button type="button">Undo</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = () => { hide(); undo(); };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, duration);
  function hide() { el.classList.remove('show'); }
}

// ---- bottom sheet -----------------------------------------------------------

/**
 * Opens a bottom sheet. `actions` maps data-sa values to handlers
 * (handler receives (button, dialog); return false to keep it open).
 */
export function sheet({ title, body, actions = {} }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  dlg.innerHTML = `<div class="sheet-inner" tabindex="-1" autofocus><div class="sheet-grab"></div>
    ${title ? `<h2 class="sheet-title">${esc(title)}</h2>` : ''}${body}</div>`;
  document.body.appendChild(dlg);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) return dlg.close(); // backdrop
    const btn = e.target.closest('[data-sa]');
    if (!btn) return;
    e.preventDefault();
    const fn = actions[btn.dataset.sa];
    const keep = fn ? fn(btn, dlg) === false : false;
    if (!keep) dlg.close();
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  return dlg;
}

export function confirmSheet(message, { ok = 'OK', danger = false } = {}) {
  return new Promise((resolve) => {
    let result = false;
    const dlg = sheet({
      title: message,
      body: `<div class="stack">
        <button class="btn ${danger ? 'danger' : 'primary'}" data-sa="ok">${esc(ok)}</button>
        <button class="btn" data-sa="cancel">Cancel</button></div>`,
      actions: { ok: () => { result = true; } },
    });
    dlg.addEventListener('close', () => resolve(result));
  });
}

// ---- files ------------------------------------------------------------------

/**
 * Share a file through the iOS share sheet (Save to Files, Calendar, etc.)
 * or fall back to a download. Resolves true if the user completed it.
 */
export async function saveFile(name, mime, text) {
  const blob = new Blob([text], { type: mime });
  try {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (e) {
    if (e?.name === 'AbortError') return false;
    // fall through to download
  }
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return true;
}
