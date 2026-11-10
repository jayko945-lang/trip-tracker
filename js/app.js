// App shell: hash router, header, tab bar, delegated actions.
import * as store from './store.js';
import { esc, icons, toast, reduceMotion } from './ui.js';
import home from './views/home.js';
import trips from './views/trips.js';
import trip from './views/trip.js';
import edit from './views/edit.js';
import settings from './views/settings.js';

const routes = [
  [/^#?\/?(home)?$/, home, 'home'],
  [/^#\/trips$/, trips, 'trips'],
  [/^#\/trip\/([^/]+)$/, trip, 'trips'],
  [/^#\/new$/, edit, 'new'],
  [/^#\/edit\/([^/]+)$/, edit, 'trips'],
  [/^#\/settings$/, settings, 'settings'],
];

const main = document.getElementById('main');
const header = document.getElementById('topbar');
let current = null;

function resolve() {
  const hash = location.hash || '#/';
  for (const [re, view, tab] of routes) {
    const m = hash.match(re);
    if (m) return { view, tab, params: m.slice(1) };
  }
  return { view: home, tab: 'home', params: [] };
}

export function render({ keepScroll = false } = {}) {
  const y = main.scrollTop;
  const { view, tab, params } = resolve();
  current = view(...params);
  document.title = current.title ? `${current.title} · Trip Tracker` : 'Trip Tracker';
  header.innerHTML = `
    <div class="tb-side">${current.back ? `<a class="tb-btn" href="${esc(current.back)}" aria-label="Back">${icons.back}<span>Back</span></a>` : ''}</div>
    <h1>${esc(current.title || 'Trip Tracker')}</h1>
    <div class="tb-side right">${current.right || ''}</div>`;
  main.innerHTML = `<div class="content">${current.html}</div>`;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  current.mount?.(main);
  main.scrollTop = keepScroll ? y : 0;
}

/**
 * Animate a redraw with the View Transitions API (iOS 18+): tagged elements
 * slide/resize to their new spots, everything else cross-fades. Falls back to
 * an instant redraw when unsupported, when Reduce Motion is on, or while a
 * sheet is open (it covers the screen anyway).
 */
let activeTransition = null;
let rescueUntil = 0;

function transition(update, { nav = false } = {}) {
  if (!document.startViewTransition || reduceMotion() || document.hidden || document.querySelector('dialog[open]')) {
    update();
    return;
  }
  const root = document.documentElement;
  // Between screens, just cross-fade; don't fly rows from one screen to another.
  root.classList.toggle('vt-nav', nav);
  const t = document.startViewTransition(update);
  activeTransition = t;
  t.ready.catch(() => {}); // a newer redraw interrupted this one; that's fine
  t.finished.finally(() => {
    if (activeTransition === t) activeTransition = null;
    root.classList.remove('vt-nav');
  });
}

export const rerender = () => transition(() => render({ keepScroll: true }));

// While an animation plays, the browser sends taps to the page background.
// So a tap that starts mid-animation finishes the animation at once, and the
// tap is handed to whatever is now under the finger. Quick taps are never lost.
document.addEventListener('pointerdown', () => {
  if (!activeTransition) return;
  activeTransition.skipTransition();
  rescueUntil = performance.now() + 1500;
}, true);

document.addEventListener('click', (e) => {
  if (performance.now() > rescueUntil) return;
  if (e.target !== document.documentElement && e.target !== document.body) return;
  rescueUntil = 0;
  const real = document.elementFromPoint(e.clientX, e.clientY);
  if (!real || real === document.documentElement || real === document.body) return;
  e.preventDefault();
  e.stopPropagation();
  if (real.matches('input, textarea, select')) real.focus();
  real.click();
}, true);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !current?.actions) return;
  const fn = current.actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

window.addEventListener('hashchange', () => transition(() => render(), { nav: true }));

store.load();
render();

if (store.lastSaveError()) toast('Could not save — storage is full or blocked.');
store.onChange(() => { if (store.lastSaveError()) toast('Could not save — storage is full or blocked.'); });
store.requestPersistence();

// ---- updates ---------------------------------------------------------------
// The service worker says when a newer version has been downloaded; we show a
// bar, and "Reload" refreshes every cached file first so nothing is mixed.

const JUST_UPDATED = 'tripTracker.justUpdated';

/** Reload into the new version, after any updater still installing has finished. */
async function applyUpdate() {
  try { sessionStorage.setItem(JUST_UPDATED, String(Date.now())); } catch { /* ignore */ }
  setTimeout(() => location.reload(), 8000); // never get stuck on "Updating…"
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  try { await reg?.update(); } catch { /* offline */ }
  const pending = reg?.installing || reg?.waiting;
  if (pending) {
    // A new updater downloads every file fresh when it installs; wait for it to take over.
    await new Promise((resolve) => {
      if (pending.state === 'activated') return resolve();
      pending.addEventListener('statechange', () => { if (pending.state === 'activated') resolve(); });
    });
    return location.reload();
  }
  const sw = navigator.serviceWorker.controller;
  if (!sw) return location.reload();
  sw.postMessage({ type: 'apply-update' }); // replies 'update-applied' once files are refreshed
}

/** True for a short while after the user tapped Reload (so a late announcement doesn't re-show the bar). */
function justUpdated() {
  try { return Date.now() - Number(sessionStorage.getItem(JUST_UPDATED) || 0) < 60000; } catch { return false; }
}

function showUpdateBar() {
  if (document.getElementById('update-bar') || justUpdated()) return;
  const bar = document.createElement('div');
  bar.id = 'update-bar';
  bar.setAttribute('role', 'status');
  bar.style.setProperty('--vt', 'vt-updatebar');
  bar.innerHTML = '<span>A new version is ready.</span><button type="button">Reload</button>';
  bar.querySelector('button').onclick = () => {
    bar.querySelector('button').disabled = true;
    bar.querySelector('span').textContent = 'Updating…';
    applyUpdate();
  };
  document.body.appendChild(bar);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'update-ready') showUpdateBar();
    if (e.data?.type === 'update-applied') location.reload();
  });
  // A new service worker took over (sw.js itself changed).
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdateBar(); });
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
