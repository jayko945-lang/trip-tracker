import * as store from '../store.js';
import { daysBetween, todayISO } from '../dates.js';
import { effectiveDue, bucketFor, isOpen } from '../domain.js';
import { esc, fmtDate, relDays, icons, vt } from '../ui.js';

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
  return `<a class="banner warn" href="#/settings"${vt('banner')}>${icons.warn}
    <span><strong>${msg}</strong> iPhone can clear web app data. Tap to export a backup.</span></a>`;
}

/**
 * One task row. In Home, tapping the body expands a panel (note + view trip);
 * in the trip detail, it opens the task sheet.
 */
export function taskRow(trip, task, { today, showTrip = false, tripName = showTrip, rule = '', expanded = false } = {}) {
  const due = effectiveDue(task);
  const open = isOpen(task);
  const bucket = open ? bucketFor(task, today) : '';
  const cls = ['task', task.status, bucket, task.inactive ? 'inactive' : '', expanded ? 'expanded' : ''].join(' ');
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
    ? `<button class="task-body" data-action="expand" data-trip="${esc(trip.id)}" data-key="${esc(task.key)}"
        aria-expanded="${expanded}">${body}</button>`
    : `<button class="task-body" data-action="taskMenu" data-key="${esc(task.key)}">${body}</button>`;
  const panel = expanded ? `<div class="task-panel">
      <label class="field"><span>Note</span>
        <textarea rows="2" maxlength="1000" data-note placeholder="e.g. Bus confirmation #, who you emailed">${esc(task.note || '')}</textarea></label>
      <div class="task-panel-buttons">
        <button class="btn primary" data-action="saveNote" data-trip="${esc(trip.id)}" data-key="${esc(task.key)}">Save note</button>
        <a class="btn" href="#/trip/${encodeURIComponent(trip.id)}">View trip</a>
      </div>
    </div>` : '';
  return `<li class="${cls}"${vt(`t-${trip.id}-${task.key}`)}>${check}${bodyEl}${panel}</li>`;
}

export { todayISO };
