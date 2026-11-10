import * as store from '../store.js';
import { KINDS } from '../templates.js';
import { tripProgress, isOpen, bucketFor } from '../domain.js';
import { esc, fmtRange, icons } from '../ui.js';
import { rerender } from '../app.js';
import { backupBanner, todayISO } from './common.js';

const PREF = 'tripTracker.filter';
let filter = (() => { try { return localStorage.getItem(PREF) || ''; } catch { return ''; } })();

function card(trip, today) {
  const p = tripProgress(trip);
  const overdue = trip.tasks.filter((t) => isOpen(t) && bucketFor(t, today) === 'overdue').length;
  return `<li><a class="card trip-card" href="#/trip/${encodeURIComponent(trip.id)}">
    <div class="trip-card-main">
      <span class="trip-title">${esc(trip.title)}</span>
      <span class="trip-sub">${esc(KINDS[trip.kind].label)} · ${fmtRange(trip.startDate, trip.endDate)}</span>
      ${trip.destination ? `<span class="trip-sub">${esc(trip.destination)}</span>` : ''}
      <span class="trip-tags">${trip.tags.map((t) => `<span class="chip small">${esc(t)}</span>`).join('')}</span>
    </div>
    <div class="trip-card-side">
      ${overdue ? `<span class="badge danger">${overdue} overdue</span>` : ''}
      <span class="progress">${p.done}/${p.total}</span>
      ${icons.chevron}
    </div></a></li>`;
}

export default function trips() {
  const today = todayISO();
  const all = store.getTrips();
  const tags = [...new Set([...store.getSettings().tags, ...all.flatMap((t) => t.tags)])].sort();
  if (filter && !tags.includes(filter)) filter = '';
  const shown = all.filter((t) => !filter || t.tags.includes(filter));
  const upcoming = shown.filter((t) => (t.endDate || t.startDate) >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const past = shown.filter((t) => (t.endDate || t.startDate) < today).sort((a, b) => b.startDate.localeCompare(a.startDate));

  let html = backupBanner();
  if (tags.length) {
    html += `<div class="chips scroll" role="toolbar" aria-label="Filter by class or team">
      <button class="chip ${!filter ? 'on' : ''}" data-action="filter" data-tag="">All</button>
      ${tags.map((t) => `<button class="chip ${filter === t ? 'on' : ''}" data-action="filter" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
    </div>`;
  }
  if (!all.length) {
    html += `<div class="empty"><p class="empty-title">No trips yet</p><a class="btn primary" href="#/new">Add a trip</a></div>`;
  } else {
    html += `<section class="group"><h2 class="group-title">Upcoming <span class="count">${upcoming.length}</span></h2>
      ${upcoming.length ? `<ul class="cards trip-grid">${upcoming.map((t) => card(t, today)).join('')}</ul>` : '<p class="muted pad">Nothing upcoming.</p>'}</section>`;
    if (past.length) {
      html += `<section class="group"><h2 class="group-title">Past <span class="count">${past.length}</span></h2>
        <ul class="cards trip-grid">${past.map((t) => card(t, today)).join('')}</ul></section>`;
    }
  }

  return {
    title: 'Trips',
    right: '<a class="tb-btn" href="#/new" aria-label="New trip">New</a>',
    html,
    actions: {
      filter(el) {
        filter = el.dataset.tag;
        try { localStorage.setItem(PREF, filter); } catch { /* ignore */ }
        rerender();
      },
    },
  };
}
