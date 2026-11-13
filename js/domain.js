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
  return applyRoster({ ...trip, tasks });
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

// ---- student roster ------------------------------------------------------------
// Student names are personal information: they live on this device only and are
// never put in calendar files, and backups include them only if asked.
// One check per student: permission slip turned in (it includes the medical
// form). Payment isn't tracked: a student who's eligible to go has paid.

/** The task that the roster can complete on its own. */
export const FORMS_TASK = 'permissionDue';

/** Split pasted text into names: one per line (or comma/semicolon separated), trimmed, no duplicates. */
export function parseNames(text, existing = []) {
  const seen = new Set(existing.map((n) => n.toLowerCase()));
  const out = [];
  for (const raw of String(text || '').split(/[\n;,\t]+/)) {
    const name = raw.replace(/^\s*(?:\d+[.)]|[-•*])\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out;
}

export function rosterStats(trip) {
  const list = trip.students || [];
  const slipsIn = list.filter((s) => s.slip).length;
  return { total: list.length, slipsIn, allIn: list.length > 0 && slipsIn === list.length };
}

/** Names of students who haven't turned in their slip, A to Z. */
export function missingSlips(trip) {
  return (trip.students || []).filter((s) => !s.slip).map((s) => s.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

/**
 * Keep trip fields in step with its roster (when it has one):
 * - student count = number of students
 * - with { formsChanged: true } (a slip was just checked or unchecked), the
 *   "slips collected" task checks itself off when every slip is in, and
 *   un-checks if one is later unmarked (only if it checked itself off).
 *   Only on roster changes, so unchecking the task by hand sticks.
 */
export function applyRoster(trip, { formsChanged = false, now = new Date().toISOString() } = {}) {
  const list = trip.students || [];
  if (!list.length) return trip;
  const stats = rosterStats(trip);
  const next = { ...trip, studentCount: stats.total };
  if (!formsChanged) return next;
  next.tasks = (trip.tasks || []).map((t) => {
    if (t.key !== FORMS_TASK || t.inactive) return t;
    if (stats.allIn && t.status === 'todo') return { ...t, status: 'done', completedAt: now, autoDone: true };
    if (!stats.allIn && t.status === 'done' && t.autoDone) return { ...t, status: 'todo', completedAt: null, autoDone: false };
    return t;
  });
  return next;
}

/** A copy of the app data with all student names removed (for backups without names). */
export function withoutStudents(data) {
  return {
    ...data,
    studentsIncluded: false,
    trips: (data.trips || []).map((t) => ({ ...t, students: [] })),
    settings: { ...data.settings, rosters: {} },
  };
}
