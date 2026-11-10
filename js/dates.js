// Pure date helpers. Dates are 'YYYY-MM-DD' strings; math is done in UTC
// so daylight-saving changes never shift a day.

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(s) {
  if (typeof s !== 'string' || !ISO_RE.test(s)) return false;
  return toISO(parseISO(s)) === s; // rejects 2027-02-30 etc.
}

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

/** 0 = Sunday … 6 = Saturday */
export function dayOfWeek(iso) {
  return parseISO(iso).getUTCDay();
}

export function isWeekend(iso) {
  const d = dayOfWeek(iso);
  return d === 0 || d === 6;
}

/** Whole calendar days from a to b (b - a). */
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

/** Today's date in the device's local time zone. */
export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Every date from start to end inclusive. */
export function expandRange(start, end = start) {
  if (!isISODate(start)) return [];
  if (!isISODate(end) || end < start) end = start;
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Build the set of weekday dates that are NOT school days.
 * entries: [{ start, end, type: 'closed' | 'workday' }]
 * Student-free workdays are excluded unless workdaysCountAsSchool is true.
 */
export function buildClosedSet(entries = [], { workdaysCountAsSchool = false } = {}) {
  const set = new Set();
  for (const e of entries) {
    if (e.type === 'workday' && workdaysCountAsSchool) continue;
    for (const d of expandRange(e.start, e.end)) set.add(d);
  }
  return set;
}

export function isSchoolDay(iso, closedSet) {
  return !isWeekend(iso) && !closedSet.has(iso);
}

/**
 * The date N school days before the event. The event date itself is never
 * counted; N = 0 returns the event date.
 */
export function schoolDaysBefore(eventISO, n, closedSet) {
  n = Math.max(0, Math.floor(Number(n) || 0));
  let d = eventISO;
  let counted = 0;
  let guard = 0;
  while (counted < n) {
    d = addDays(d, -1);
    if (isSchoolDay(d, closedSet)) counted++;
    if (++guard > 10000) throw new Error('No school days found — check the no-school calendar');
  }
  return d;
}

export function calendarDaysBefore(eventISO, n) {
  return addDays(eventISO, -Math.max(0, Math.floor(Number(n) || 0)));
}

/** rule: { unit: 'school' | 'calendar' | 'manual', n } → ISO date or null */
export function dueFromRule(rule, eventISO, closedSet) {
  if (!rule || !isISODate(eventISO)) return null;
  if (rule.unit === 'school') return schoolDaysBefore(eventISO, rule.n, closedSet);
  if (rule.unit === 'calendar') return calendarDaysBefore(eventISO, rule.n);
  return null; // manual
}
