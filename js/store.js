// Persistence in localStorage. Everything is one JSON document, so export
// and import are a straight copy. Never stores student names or grades.
import { buildClosedSet, isISODate } from './dates.js';
import { getTemplates, KINDS } from './templates.js';
import { refreshTrip } from './domain.js';
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
  };
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

export function deleteTrip(id) {
  state.trips = state.trips.filter((t) => t.id !== id);
  persist();
}

export function updateTask(tripId, key, patch) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.tasks = trip.tasks.map((t) => {
    if (t.key !== key) return t;
    const next = { ...t, ...patch };
    if ('status' in patch) next.completedAt = patch.status === 'done' ? new Date().toISOString() : null;
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

export function deleteTask(tripId, key) {
  const trip = getTrip(tripId);
  if (!trip) return;
  trip.tasks = trip.tasks.filter((t) => !(t.key === key && t.custom));
  persist();
}

// ---- settings ---------------------------------------------------------------

export function updateSettings(patch) {
  state.settings = normalizeSettings({ ...state.settings, ...patch });
  refreshAll();
  persist();
}

export function renameTag(oldName, newName) {
  newName = newName.trim();
  if (!newName || oldName === newName) return;
  state.settings.tags = [...new Set(state.settings.tags.map((t) => (t === oldName ? newName : t)))];
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

export function exportJSON() {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString(), app: 'trip-tracker' }, null, 2);
}

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
  state = normalizeState(raw);
  refreshAll();
  persist();
  return state.trips.length;
}
