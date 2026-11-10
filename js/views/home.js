import * as store from '../store.js';
import { openTasksByBucket, BUCKETS } from '../domain.js';
import { toast } from '../ui.js';
import { rerender } from '../app.js';
import { backupBanner, taskRow, todayISO } from './common.js';

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
    for (const [key, label] of BUCKETS) {
      const list = groups[key];
      if (!list.length) continue;
      html += `<section class="group ${key}"><h2 class="group-title">${label} <span class="count">${list.length}</span></h2>
        <ul class="tasks">${list.map(({ trip, task }) => taskRow(trip, task, { today, showTrip: true })).join('')}</ul></section>`;
    }
  }

  return {
    title: 'To do',
    right: '<a class="tb-btn" href="#/new" aria-label="New trip">New</a>',
    html,
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
