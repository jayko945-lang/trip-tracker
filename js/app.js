// App shell: hash router, header, tab bar, delegated actions.
import * as store from './store.js';
import { esc, icons, toast } from './ui.js';
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
  const y = window.scrollY;
  const { view, tab, params } = resolve();
  current = view(...params);
  document.title = current.title ? `${current.title} · Trip Tracker` : 'Trip Tracker';
  header.innerHTML = `
    <div class="tb-side">${current.back ? `<a class="tb-btn" href="${esc(current.back)}" aria-label="Back">${icons.back}<span>Back</span></a>` : ''}</div>
    <h1>${esc(current.title || 'Trip Tracker')}</h1>
    <div class="tb-side right">${current.right || ''}</div>`;
  main.innerHTML = current.html;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
  current.mount?.(main);
  window.scrollTo(0, keepScroll ? y : 0);
}

export const rerender = () => render({ keepScroll: true });

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || !current?.actions) return;
  const fn = current.actions[el.dataset.action];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

window.addEventListener('hashchange', () => render());

store.load();
render();

if (store.lastSaveError()) toast('Could not save — storage is full or blocked.');
store.onChange(() => { if (store.lastSaveError()) toast('Could not save — storage is full or blocked.'); });
store.requestPersistence();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
