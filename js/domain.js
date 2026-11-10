// Trip/task rules that don't touch storage or the DOM.
import { dueFromRule, daysBetween } from './dates.js';
import { templateApplies } from './templates.js';

export function newTask(tpl) {
  return {
    key: tpl.key, label: tpl.label, dueDate: null, dueOverride: null,
    status: 'todo', completedAt: null, inactive: false, custom: false,
  };
}

/**
 * Add tasks for templates that now apply and drop ones that no longer apply.
 * Completed tasks are never dropped: they stay, marked inactive.
 * Custom tasks are always kept.
 */
export function reconcileTasks(trip, templates) {
  const existing = new Map((trip.tasks || []).map((t) => [t.key, t]));
  const out = [];
  for (const tpl of templates) {
    const cur = existing.get(tpl.key);
    existing.delete(tpl.key);
    const applies = templateApplies(tpl, trip);
    if (applies) {
      out.push(cur ? { ...cur, label: tpl.label, inactive: false } : newTask(tpl));
    } else if (cur && cur.status === 'done') {
      out.push({ ...cur, label: tpl.label, inactive: true });
    }
  }
  for (const t of existing.values()) {
    if (t.custom) out.push(t);
    else if (t.status === 'done') out.push({ ...t, inactive: true }); // template removed from code
  }
  return out;
}

/** Recompute stored dueDate for every task in a trip. Returns a new trip. */
export function refreshTrip(trip, templates, closedSet) {
  const byKey = new Map(templates.map((t) => [t.key, t]));
  const tasks = reconcileTasks(trip, templates).map((task) => {
    const tpl = byKey.get(task.key);
    const dueDate = task.custom || !tpl ? null : dueFromRule(tpl, trip.startDate, closedSet);
    return { ...task, dueDate };
  });
  return { ...trip, tasks };
}

export function effectiveDue(task) {
  return task.dueOverride || task.dueDate || null;
}

export function isOpen(task) {
  return task.status === 'todo' && !task.inactive;
}

/** 'overdue' | 'today' | 'week' | 'later' | 'nodate' for an open task. */
export function bucketFor(task, today) {
  const due = effectiveDue(task);
  if (!due) return 'nodate';
  const diff = daysBetween(today, due);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  if (diff <= 7) return 'week';
  return 'later';
}

export const BUCKETS = [
  ['overdue', 'Overdue'],
  ['nodate', 'Needs a due date'],
  ['today', 'Today'],
  ['week', 'This week'],
  ['later', 'Later'],
];

/** Trips that ended more than this many days ago drop off the Home screen. */
export const HOME_GRACE_DAYS = 7;

/** All open tasks across trips, grouped by bucket and sorted by due date. */
export function openTasksByBucket(trips, today) {
  const groups = Object.fromEntries(BUCKETS.map(([k]) => [k, []]));
  for (const trip of trips) {
    const end = trip.endDate || trip.startDate;
    if (end && daysBetween(end, today) > HOME_GRACE_DAYS) continue;
    for (const task of trip.tasks || []) {
      if (!isOpen(task)) continue;
      groups[bucketFor(task, today)].push({ trip, task, due: effectiveDue(task) });
    }
  }
  for (const list of Object.values(groups)) {
    list.sort((a, b) => (a.due || '').localeCompare(b.due || '') ||
      (a.trip.startDate || '').localeCompare(b.trip.startDate || ''));
  }
  return groups;
}

/**
 * District ratio: 1 chaperone per 25 students on day trips (recommended),
 * 1 per 15 on overnight trips (required).
 */
export function chaperoneCheck(trip) {
  const students = Math.max(0, Number(trip.studentCount) || 0);
  const have = (trip.chaperones || []).filter((c) => c.trim()).length;
  const overnight = !!trip.flags?.overnight;
  const per = overnight ? 15 : 25;
  const needed = Math.ceil(students / per);
  return { students, have, needed, per, overnight, ok: have >= needed };
}

export function tripProgress(trip) {
  const active = (trip.tasks || []).filter((t) => !t.inactive && t.status !== 'na');
  return { done: active.filter((t) => t.status === 'done').length, total: active.length };
}

export function ruleText(tpl) {
  if (!tpl || tpl.unit === 'manual') return 'Manual date';
  if (tpl.n === 0) return 'Day of event';
  const unit = tpl.unit === 'school' ? 'school day' : 'calendar day';
  return `${tpl.n} ${unit}${tpl.n === 1 ? '' : 's'} before`;
}
