import * as store from '../store.js';
import { openTasksByBucket, BUCKETS } from '../domain.js';
import { esc, toast, icons } from '../ui.js';
import { rerender } from '../app.js';
import { backupBanner, taskRow, todayISO } from './common.js';

// "Later" starts collapsed; remember if it was opened while the app is running.
let laterOpen = false;

/** Split a bucket's tasks into per-trip groups, ordered by each trip's earliest due date. */
function byTrip(list) {
  const groups = new Map();
  for (const item of list) {
    if (!groups.has(item.trip.id)) groups.set(item.trip.id, { trip: item.trip, items: [] });
    groups.get(item.trip.id).items.push(item);
  }
  return [...groups.values()];
}

function section(key, label, list, today) {
  if (!list.length) return '';
  const body = byTrip(list).map(({ trip, items }) => `
    <div class="trip-group">
      <a class="trip-group-head" href="#/trip/${encodeURIComponent(trip.id)}">
        <span>${esc(trip.title)}</span><span class="count">${items.length}</span>${icons.chevron}</a>
      <ul class="tasks">${items.map(({ task }) => taskRow(trip, task, { today, showTrip: true, tripName: false })).join('')}</ul>
    </div>`).join('');
  const title = `${label} <span class="count">${list.length}</span>`;
  if (key === 'later') {
    return `<details class="group later" id="later" ${laterOpen ? 'open' : ''}>
      <summary class="group-title">${title}<span class="summary-hint">${laterOpen ? 'Hide' : 'Show'}</span></summary>${body}</details>`;
  }
  return `<section class="group ${key}"><h2 class="group-title">${title}</h2>${body}</section>`;
}

export default function home() {
  const today = todayISO();
  const trips = store.getTrips();
  const groups = openTasksByBucket(trips, today);
  const total = Object.values(groups).reduce((n, g) => n + g.length, 0);

  let html = backupBanner();
  if (!trips.length) {
    html += `<div class="empty"><p class="empty-title">No trips yet</p>
      <p>Add a field trip, robotics event, or overnight trip and its paperwork checklist is built for you.</p>
      <a class="btn primary" href="#/new">Add a trip</a></div>`;
  } else if (!total) {
    html += `<div class="empty"><p class="empty-title">All caught up</p><p>No open paperwork.</p></div>`;
  } else {
    // Two panes on wide screens (iPhone Duo inner display, iPad); stacked on phones.
    const pane = (keys) => BUCKETS.filter(([k]) => keys.includes(k)).map(([k, l]) => section(k, l, groups[k], today)).join('');
    const now = pane(['overdue', 'nodate', 'today']);
    const soon = pane(['week', 'later']);
    html += now && soon
      ? `<div class="panes"><div class="pane">${now}</div><div class="pane">${soon}</div></div>`
      : now + soon;
  }

  return {
    title: 'To do',
    right: '<a class="tb-btn" href="#/new" aria-label="New trip">New</a>',
    html,
    mount(root) {
      const later = root.querySelector('#later');
      later?.addEventListener('toggle', () => {
        laterOpen = later.open;
        later.querySelector('.summary-hint').textContent = laterOpen ? 'Hide' : 'Show';
      });
    },
    actions: {
      toggle(el) {
        const { trip, key } = el.dataset;
        const t = store.getTrip(trip)?.tasks.find((x) => x.key === key);
        const prev = t?.status || 'todo';
        el.closest('.task')?.classList.add('completing');
        store.updateTask(trip, key, { status: 'done' });
        setTimeout(rerender, 250);
        toast('Marked done', { undo: () => { store.updateTask(trip, key, { status: prev }); rerender(); } });
      },
    },
  };
}
