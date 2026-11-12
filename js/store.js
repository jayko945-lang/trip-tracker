// Persistence in localStorage. Everything is one JSON document, so export
// and import are a straight copy. Never stores student names or grades.
import { buildClosedSet, isISODate } from './dates.js';
import { getTemplates, KINDS } from './templates.js';
import { refreshTrip, applyRoster, parseNames, withoutStudents } from './domain.js';
import { SEED_NO_SCHOOL } from './seed.js';

const KEY = 'tripTracker.v1';
const VERSION = 1;
const listeners = new Set();
let state;

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

function defaultSettings() {
  return {
    noSchool: SEED_NO_SCHOOL.map((e) => ({ ...e })),
    workdaysCountAsSchool: false,
    templateOverrides: {},
    tags: [],
    rosters: {}, // class/team name -> student names (personal info, device only)
    lastBackupAt: null,
  };
}

function str(v, max = 2000) { return typeof v === 'string' ? v.slice(0, max) : ''; }
function num(v) { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; }

function normalizeTask(t) {
  return {
    key: str(t.key, 100) || uid(),
    label: str(t.label, 300),
    dueDate: isISODate(t.dueDate) ? t.dueDate : null,
    dueOverride: isISODate(t.dueOverride) ? t.dueOverride : null,
    status: ['todo', 'done', 'na'].includes(t.status) ? t.status : 'todo',
    completedAt: t.completedAt ? String(t.completedAt) : null,
    inactive: !!t.inactive,
    custom: !!t.custom,
    note: str(t.note, 1000),
    autoDone: !!t.autoDone,
  };
}

function normalizeTrip(t) {
  const kind = KINDS[t.kind] ? t.kind : 'field';
  const start = isISODate(t.startDate) ? t.startDate : '';
  const end = isISODate(t.endDate) && t.endDate >= start ? t.endDate : start;
  const flags = {};
  for (const k of Object.keys(KINDS.field.flags)) flags[k] = !!t.flags?.[k];
  return {
    id: str(t.id, 100) || uid(),
    title: str(t.title, 200) || 'Untitled trip',
    kind,
    tags: Array.isArray(t.tags) ? [...new Set(t.tags.map((x) => str(x, 80).trim()).filter(Boolean))] : [],
    startDate: start,
    endDate: end,
    destination: str(t.destination, 300),
    flags,
    studentCount: Math.floor(num(t.studentCount)),
    chaperones: Array.isArray(t.chaperones) ? t.chaperones.map((c) => str(c, 120).trim()).filter(Boolean) : [],
    costPerStudent: num(t.costPerStudent),
    amountCollected: num(t.amountCollected),
    notes: str(t.notes, 20000),
    tasks: Array.isArray(t.tasks) ? t.tasks.map(normalizeTask) : [],
    // Personal information: kept on this device only (see withoutStudents for backups)
    students: Array.isArray(t.students) ? t.students.filter((x) => x && typeof x.name === 'string' && x.name.trim()).map((x) => ({
      id: str(x.id, 100) || uid(), name: str(x.name, 120).trim(), slip: !!x.slip, medical: !!x.medical, paid: !!x.paid,
    })) : [],
    createdAt: t.createdAt || new Date().toISOString(),
    updatedAt: t.updatedAt || new Date().toISOString(),
  };
}

function normalizeSettings(s = {}) {
  const d = defaultSettings();
  const noSchool = Array.isArray(s.noSchool)
    ? s.noSchool.filter((e) => isISODate(e.start)).map((e) => ({
      id: str(e.id, 100) || uid(),
      start: e.start,
      end: isISODate(e.end) && e.end >= e.start ? e.end : e.start,
      label: str(e.label, 120),
      type: e.type === 'workday' ? 'workday' : 'closed',
    }))
    : d.noSchool;
  const overrides = {};
  if (s.templateOverrides && typeof s.templateOverrides === 'object') {
    for (const [k, v] of Object.entries(s.templateOverrides)) {
      if (!v || typeof v !== 'object') continue;
      overrides[k] = {};
      if (typeof v.label === 'string') overrides[k].label = str(v.label, 300);
      if (v.unit === 'school' || v.unit === 'calendar') overrides[k].unit = v.unit;
      if (Number.isFinite(v.n)) overrides[k].n = Math.max(0, Math.min(365, Math.floor(v.n)));
    }
  }
  return {
    noSchool,
    workdaysCountAsSchool: !!s.workdaysCountAsSchool,
    templateOverrides: overrides,
    tags: Array.isArray(s.tags) ? [...new Set(s.tags.map((x) => str(x, 80).trim()).filter(Boolean))] : [],
    lastBackupAt: s.lastBackupAt || null,
    rosters: normalizeRosters(s.rosters),
  };
}

function normalizeRosters(r) {
  const out = {};
  if (!r || typeof r !== 'object') return out;
  for (const [tag, names] of Object.entries(r)) {
    if (!Array.isArray(names)) continue;
    const list = parseNames(names.filter((n) => typeof n === 'string').join('\n'));
    if (list.length) out[str(tag, 80)] = list;
  }
  return out;
}

function normalizeState(raw) {
  return {
    version: VERSION,
    settings: normalizeSettings(raw?.settings),
    trips: Array.isArray(raw?.trips) ? raw.trips.map(normalizeTrip) : [],
  };
}

// ---- context for due-date math ------------------------------------------

export function context() {
  const s = state.settings;
  return {
    templates: getTemplates(s.templateOverrides),
    closedSet: buildClosedSet(s.noSchool, { workdaysCountAsSchool: s.workdaysCountAsSchool }),
  };
}

function refreshAll() {
  const { templates, closedSet } = context();
  state.trips = state.trips.map((t) => refreshTrip(t, templates, closedSet));
}

// ---- load / save ----------------------------------------------------------

export function load() {
  let raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { raw = null; }
  state = normalizeState(raw);
  refreshAll();
  persist(false);
  return state;
}

let saveError = null;
function persist(notify = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = null;
  } catch (e) {
    saveError = e;
  }
  if (notify) listeners.forEach((fn) => fn());
}
export const lastSaveError = () => saveError;
export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

/** Ask the browser not to evict our storage (best effort). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}

// ---- trips ------------------------------------------------------------------

export const getSettings = () => state.settings;
export const getTrips = () => state.trips;
export const getTrip = (id) => state.trips.find((t) => t.id === id) || null;

export function saveTrip(input) {
  const prev = input.id ? getTrip(input.id) : null;
  const base = normalizeTrip({ ...(prev || {}), ...input, tasks: prev?.tasks || input.tasks || [] });
  base.updatedAt = new Date().toISOString();
  const { templates, closedSet } = context();
  const trip = refreshTrip(base, templates, closedSet);
  // Keep the shared tag list in sync with any new tags.
  const tags = new Set(state.settings.tags);
  trip.tags.forEach((t) => tags.add(t));
  state.settings.tags = [...tags];
  state.trips = prev ? state.trips.map((t) => (t.id === trip.id ? trip : t)) : [...state.trips, trip];
  persist();
  return trip;
}

/** Removes a trip; returns what restoreTrip needs to undo it. */
export function deleteTrip(id) {
  const index = state.trips.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const [trip] = state.trips.splice(index, 1);
  persist();
  return { trip, index };
}

export function restoreTrip({ trip, index }) {
  if (getTrip(trip.id)) return;
  state.trips.splice(Math.min(index, state.trips.length), 0, trip);
  persist();
}

export function updateTask(tripId, key, patch) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.tasks = trip.tasks.map((t) => {
    if (t.key !== key) return t;
    const next = { ...t, ...patch };
    if ('status' in patch) next.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
    if ('status' in patch) next.autoDone = false; // set by hand from now on
    return next;
  });
  trip.updatedAt = new Date().toISOString();
  persist();
}

export function addCustomTask(tripId, label, due) {
  const trip = getTrip(tripId);
  if (!trip || !label.trim()) return;
  trip.tasks.push(normalizeTask({
    key: `custom-${uid()}`, label: label.trim(), custom: true, status: 'todo',
    dueOverride: isISODate(due) ? due : null,
  }));
  persist();
}

/** Deletes a custom task; returns what restoreTask needs to undo it. */
export function deleteTask(tripId, key) {
  const trip = getTrip(tripId);
  if (!trip) return null;
  const index = trip.tasks.findIndex((t) => t.key === key && t.custom);
  if (index < 0) return null;
  const [task] = trip.tasks.splice(index, 1);
  persist();
  return { tripId, task, index };
}

export function restoreTask({ tripId, task, index }) {
  const trip = getTrip(tripId);
  if (!trip || trip.tasks.some((t) => t.key === task.key)) return;
  trip.tasks.splice(Math.min(index, trip.tasks.length), 0, task);
  persist();
}

// ---- students (personal info: this device only) -------------------------------

function changeRoster(tripId, fn) {
  const trip = getTrip(tripId);
  if (!trip) return null;
  const students = fn(trip.students.map((x) => ({ ...x })));
  const next = applyRoster({ ...trip, students, updatedAt: new Date().toISOString() }, { formsChanged: true });
  state.trips = state.trips.map((t) => (t.id === tripId ? next : t));
  persist();
  return next;
}

/** Add names (pasted list or single name). Returns how many were new. */
export function addStudents(tripId, text) {
  const trip = getTrip(tripId);
  if (!trip) return 0;
  const names = parseNames(text, trip.students.map((x) => x.name));
  if (names.length) changeRoster(tripId, (list) => [...list, ...names.map((name) => ({ id: uid(), name, slip: false, medical: false, paid: false }))]);
  return names.length;
}

export function updateStudent(tripId, id, patch) {
  changeRoster(tripId, (list) => list.map((x) => (x.id === id ? { ...x, ...patch, name: (patch.name ?? x.name).trim() || x.name } : x)));
}

/** Removes a student; returns what restoreStudent needs to undo it. */
export function removeStudent(tripId, id) {
  const trip = getTrip(tripId);
  const index = trip?.students.findIndex((x) => x.id === id) ?? -1;
  if (index < 0) return null;
  const student = trip.students[index];
  changeRoster(tripId, (list) => list.filter((x) => x.id !== id));
  return { tripId, student, index };
}

export function restoreStudent({ tripId, student, index }) {
  changeRoster(tripId, (list) => {
    if (list.some((x) => x.id === student.id)) return list;
    const copy = [...list];
    copy.splice(Math.min(index, copy.length), 0, student);
    return copy;
  });
}

/** Save a class/team roster (names only) for quick adding to future trips. */
export function setTeamRoster(tag, text) {
  const rosters = { ...state.settings.rosters };
  const names = parseNames(text);
  if (names.length) rosters[tag] = names; else delete rosters[tag];
  state.settings.rosters = rosters;
  persist();
}

// ---- settings ---------------------------------------------------------------

export function updateSettings(patch) {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  refreshAll();
  persist();
}

/** Copy of settings, for undoing a settings change. */
export const snapshotSettings = () => structuredClone(state.settings);

export function restoreSettings(snapshot) {
  state.settings = normalizeSettings(snapshot);
  refreshAll();
  persist();
}

export function renameTag(oldName, newName) {
  newName = newName.trim();
  if (!newName || oldName === newName) return;
  state.settings.tags = [...new Set(state.settings.tags.map((t) => (t === oldName ? newName : t)))];
  if (state.settings.rosters[oldName]) {
    state.settings.rosters[newName] = state.settings.rosters[oldName];
    delete state.settings.rosters[oldName];
  }
  state.trips = state.trips.map((trip) => ({
    ...trip, tags: [...new Set(trip.tags.map((t) => (t === oldName ? newName : t)))],
  }));
  persist();
}

export function removeTag(name) {
  // Removes from the pick list only; trips keep their history.
  state.settings.tags = state.settings.tags.filter((t) => t !== name);
  persist();
}

// ---- backup -----------------------------------------------------------------

/** Backup file. Student names are included only when asked. */
export function exportJSON({ includeStudents = false } = {}) {
  const data = includeStudents ? { ...state, studentsIncluded: true } : withoutStudents(state);
  return JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'trip-tracker' }, null, 2);
}

export const hasStudentData = () =>
  state.trips.some((t) => t.students.length) || Object.keys(state.settings.rosters).length > 0;

export function markBackedUp() {
  state.settings.lastBackupAt = new Date().toISOString();
  persist();
}

/** Replaces all data. Throws on files that don't look like a backup. */
export function importJSON(text) {
  const raw = JSON.parse(text);
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.trips) || typeof raw.settings !== 'object') {
    throw new Error('This file is not a Trip Tracker backup.');
  }
  const before = state;
  state = normalizeState(raw);
  // A backup made without names must not wipe the names on this phone:
  // keep this phone's rosters for the same trips.
  if (raw.studentsIncluded === false) {
    const kept = new Map(before.trips.map((t) => [t.id, t.students]));
    state.trips = state.trips.map((t) => ({ ...t, students: kept.get(t.id) || [] }));
    state.settings.rosters = before.settings.rosters;
  }
  refreshAll();
  persist();
  return state.trips.length;
}
