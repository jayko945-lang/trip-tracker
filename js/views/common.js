import * as store from '../store.js';
import { daysBetween, todayISO } from '../dates.js';
import { effectiveDue, bucketFor, isOpen } from '../domain.js';
import { esc, fmtDate, relDays, icons } from '../ui.js';

export const BACKUP_REMINDER_DAYS = 30;

/** Reminder banner when the last backup is missing or older than 30 days. */
export function backupBanner() {
  const s = store.getSettings();
  if (!store.getTrips().length) return '';
  const today = todayISO();
  const last = s.lastBackupAt ? s.lastBackupAt.slice(0, 10) : null;
  const age = last ? daysBetween(last, today) : Infinity;
  if (age < BACKUP_REMINDER_DAYS) return '';
  const msg = last ? `Last backup was ${age} days ago.` : 'You have never backed up.';
  return `<a class="banner warn" href="#/settings">${icons.warn}
    <span><strong>${msg}</strong> iPhone can clear web app data. Tap to export a backup.</span></a>`;
}

/**
 * One task row. In Home, the body links to the trip; in the trip detail,
 * the body opens the task sheet.
 */
export function taskRow(trip, task, { today, showTrip = false, tripName = showTrip, rule = '' } = {}) {
  const due = effectiveDue(task);
  const open = isOpen(task);
  const bucket = open ? bucketFor(task, today) : '';
  const cls = ['task', task.status, bucket, task.inactive ? 'inactive' : ''].join(' ');
  const meta = [];
  if (tripName) meta.push(`<span class="trip-name">${esc(trip.title)}</span>`);
  if (showTrip) {
    if (due) meta.push(fmtDate(due));
    if (open && due) meta.push(`<span class="rel">${relDays(due, today)}</span>`);
  } else if (rule && due) {
    meta.push(esc(rule)); // trip detail: the date is already in the group heading
  }
  if (!due && open) meta.push('<span class="rel">Set a due date</span>');
  if (task.status === 'na') meta.push('Not applicable');
  if (task.inactive) meta.push('No longer required');
  const badges = [];
  if (task.key === 'itineraryPacket' && !task.inactive) badges.push('<span class="badge hard">Hard deadline</span>');
  if (showTrip && task.dueOverride && !task.custom) badges.push('<span class="badge">Custom date</span>');
  const body = `<span class="task-label">${esc(task.label)} ${badges.join(' ')}</span>
    <span class="task-meta">${meta.join(' · ')}</span>
    ${task.note ? `<span class="task-note">${esc(task.note)}</span>` : ''}`;
  const check = task.status === 'na'
    ? `<button class="check na" data-action="toggle" data-trip="${esc(trip.id)}" data-key="${esc(task.key)}" aria-label="Restore to to-do">–</button>`
    : `<button class="check" data-action="toggle" data-trip="${esc(trip.id)}" data-key="${esc(task.key)}"
        aria-label="${task.status === 'done' ? 'Mark not done' : 'Mark done'}" aria-pressed="${task.status === 'done'}">${icons.check}</button>`;
  const bodyEl = showTrip
    ? `<a class="task-body" href="#/trip/${encodeURIComponent(trip.id)}">${body}</a>`
    : `<button class="task-body" data-action="taskMenu" data-key="${esc(task.key)}">${body}</button>`;
  return `<li class="${cls}">${check}${bodyEl}</li>`;
}

export { todayISO };
