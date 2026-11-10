import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplates, KINDS } from '../js/templates.js';
import { refreshTrip, openTasksByBucket, chaperoneCheck, bucketFor, tripProgress } from '../js/domain.js';
import { buildClosedSet } from '../js/dates.js';
import { SEED_NO_SCHOOL } from '../js/seed.js';
import { buildICS } from '../js/ics.js';

const closed = buildClosedSet(SEED_NO_SCHOOL);
const templates = getTemplates();

function trip(kind, extra = {}) {
  return {
    id: 't1', title: 'Test', kind, tags: [], startDate: '2027-01-07', endDate: '2027-01-07',
    flags: { ...KINDS[kind].flags }, studentCount: 0, chaperones: [], tasks: [], ...extra,
  };
}
const keys = (t) => t.tasks.filter((x) => !x.inactive).map((x) => x.key);

test('field trip gets bus tasks, not overnight/robotics', () => {
  const t = refreshTrip(trip('field'), templates, closed);
  const k = keys(t);
  assert.ok(k.includes('busRequest') && k.includes('busConfirmed'));
  assert.ok(!k.includes('overnightForm'));
  assert.ok(!k.includes('eventRegistration'));
  assert.ok(!k.includes('travelBooked'));
  assert.equal(t.tasks.find((x) => x.key === 'itineraryPacket').dueDate, '2026-12-10');
  assert.equal(t.tasks.find((x) => x.key === 'attendanceList').dueDate, '2027-01-07');
});

test('robotics gets manual registration/payment tasks with no computed date', () => {
  const t = refreshTrip(trip('robotics'), templates, closed);
  const reg = t.tasks.find((x) => x.key === 'eventRegistration');
  assert.ok(reg);
  assert.equal(reg.dueDate, null);
  assert.equal(bucketFor(reg, '2026-11-10'), 'nodate');
});

test('turning a flag off drops todo tasks but keeps completed ones', () => {
  let t = refreshTrip(trip('field'), templates, closed);
  t.tasks = t.tasks.map((x) => (x.key === 'busRequest' ? { ...x, status: 'done', completedAt: 'x' } : x));
  t = refreshTrip({ ...t, flags: { ...t.flags, bus: false } }, templates, closed);
  const busReq = t.tasks.find((x) => x.key === 'busRequest');
  assert.equal(busReq.status, 'done');
  assert.equal(busReq.inactive, true);
  assert.equal(t.tasks.find((x) => x.key === 'busConfirmed'), undefined);
  // turning it back on revives the done one and re-adds the todo one
  t = refreshTrip({ ...t, flags: { ...t.flags, bus: true } }, templates, closed);
  assert.equal(t.tasks.find((x) => x.key === 'busRequest').inactive, false);
  assert.equal(t.tasks.find((x) => x.key === 'busConfirmed').status, 'todo');
});

test('lead-time overrides change due dates', () => {
  const tpls = getTemplates({ parentEmail: { unit: 'calendar', n: 14 } });
  const t = refreshTrip(trip('field'), tpls, closed);
  assert.equal(t.tasks.find((x) => x.key === 'parentEmail').dueDate, '2026-12-24');
});

test('manual override wins and custom tasks survive', () => {
  let t = refreshTrip(trip('field'), templates, closed);
  t.tasks.push({ key: 'c1', label: 'Custom', custom: true, status: 'todo', dueOverride: '2026-12-01', dueDate: null });
  t.tasks = t.tasks.map((x) => (x.key === 'aesop' ? { ...x, dueOverride: '2026-11-01' } : x));
  t = refreshTrip(t, templates, closed);
  assert.ok(t.tasks.find((x) => x.key === 'c1'));
  const g = openTasksByBucket([t], '2026-11-10');
  assert.equal(g.overdue[0].task.key, 'aesop');
});

test('trip created with past-due tasks is flagged overdue immediately', () => {
  // Event 2026-11-17; 10 school days before is in October -> overdue on 2026-11-10
  const t = refreshTrip(trip('field', { startDate: '2026-11-17', endDate: '2026-11-17' }), templates, closed);
  const g = openTasksByBucket([t], '2026-11-10');
  assert.ok(g.overdue.some((x) => x.task.key === 'itineraryPacket'));
});

test('grouping buckets', () => {
  const t = refreshTrip(trip('field'), templates, closed);
  const g = openTasksByBucket([t], '2026-12-10');
  assert.ok(g.today.some((x) => x.task.key === 'itineraryPacket'));
  assert.ok(g.week.some((x) => x.task.key === 'permissionHandout')); // 5 days before = 12/17
  assert.ok(g.later.some((x) => x.task.key === 'attendanceList'));
});

test('chaperone ratio', () => {
  assert.equal(chaperoneCheck({ studentCount: 26, chaperones: ['A'], flags: {} }).ok, false);
  assert.equal(chaperoneCheck({ studentCount: 25, chaperones: ['A'], flags: {} }).ok, true);
  const o = chaperoneCheck({ studentCount: 30, chaperones: ['A'], flags: { overnight: true } });
  assert.equal(o.needed, 2);
  assert.equal(o.ok, false);
  assert.equal(chaperoneCheck({ studentCount: 0, chaperones: [], flags: {} }).ok, true);
});

test('progress ignores n/a and inactive', () => {
  const t = refreshTrip(trip('field'), templates, closed);
  t.tasks[0].status = 'done';
  t.tasks[1].status = 'na';
  const p = tripProgress(t);
  assert.equal(p.done, 1);
  assert.equal(p.total, t.tasks.length - 1);
});

test('ICS export contains all-day events', () => {
  const t = refreshTrip(trip('field', { title: 'Zoo, day; trip' }), templates, closed);
  const ics = buildICS(t);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261210/);
  assert.match(ics, /Zoo\\, day\\; trip/);
  const enc = new TextEncoder();
  assert.ok(ics.split('\r\n').every((line) => enc.encode(line).length <= 75));
});

test('ICS: several trips in one file, notes included, long lines folded by bytes', () => {
  const a = refreshTrip(trip('field', { id: 'a', title: 'Zoo' }), templates, closed);
  const b = refreshTrip(trip('robotics', { id: 'b', title: 'FTC — Qualifier ✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓✓' }), templates, closed);
  a.tasks[0].note = 'Bus confirmation #4471';
  const ics = buildICS([a, b]);
  assert.equal((ics.match(/BEGIN:VCALENDAR/g) || []).length, 1);
  assert.match(ics, /UID:trip-a@/);
  assert.match(ics, /UID:trip-b@/);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.match(unfolded, /Note: Bus confirmation #4471/);
  assert.match(unfolded, /FTC — Qualifier ✓+/);
  const enc = new TextEncoder();
  assert.ok(ics.split('\r\n').every((line) => enc.encode(line).length <= 75));
});
