import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplates, KINDS } from '../js/templates.js';
import { refreshTrip, parseNames, rosterStats, missingSlips, applyRoster, withoutStudents, FORMS_TASK } from '../js/domain.js';
import { buildClosedSet } from '../js/dates.js';
import { SEED_NO_SCHOOL } from '../js/seed.js';
import { buildICS } from '../js/ics.js';

const closed = buildClosedSet(SEED_NO_SCHOOL);
const templates = getTemplates();
const mk = (students, extra = {}) => refreshTrip({
  id: 't', title: 'Trip', kind: 'field', tags: [], startDate: '2027-01-07', endDate: '2027-01-07',
  flags: { ...KINDS.field.flags }, studentCount: 0, chaperones: [], costPerStudent: 0, amountCollected: 0, tasks: [], students, ...extra,
}, templates, closed);
const s = (name, slip = false) => ({ id: name, name, slip });
const formsTask = (t) => t.tasks.find((x) => x.key === FORMS_TASK);

test('parseNames: lines, commas, numbering, bullets, duplicates, existing names', () => {
  assert.deepEqual(parseNames('1. Ana Lopez\n2) Ben  Ng\n- Cy Diaz, Dee Fox; ana lopez\n\n'), ['Ana Lopez', 'Ben Ng', 'Cy Diaz', 'Dee Fox']);
  assert.deepEqual(parseNames('Ana Lopez\nEd Kim', ['Ana Lopez']), ['Ed Kim']);
  assert.deepEqual(parseNames('   '), []);
});

test('slips in and who is missing (A to Z)', () => {
  const t = mk([s('Maya', true), s('Cy'), s('ben')]);
  assert.deepEqual(rosterStats(t), { total: 3, slipsIn: 1, allIn: false });
  assert.deepEqual(missingSlips(t), ['ben', 'Cy']);
  assert.equal(rosterStats(mk([])).allIn, false);
});

test('student count follows the roster; money is left alone', () => {
  const t = mk([s('A'), s('B'), s('C')], { studentCount: 40, costPerStudent: 12, amountCollected: 30 });
  assert.equal(t.studentCount, 3);
  assert.equal(t.amountCollected, 30);
  assert.equal(mk([], { studentCount: 40 }).studentCount, 40); // no roster: manual count kept
});

test('slips task checks itself off when every slip is in, only on roster changes', () => {
  let t = mk([s('A', true), s('B')]);
  assert.equal(formsTask(t).status, 'todo');
  t = applyRoster({ ...t, students: [s('A', true), s('B', true)] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'done');
  assert.equal(formsTask(t).autoDone, true);
  t = applyRoster({ ...t, students: [s('A', true), s('B')] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'todo');
  // unchecking the task by hand while all slips are in sticks across refreshes
  t = applyRoster({ ...t, students: [s('A', true), s('B', true)] }, { formsChanged: true });
  t = { ...t, tasks: t.tasks.map((x) => (x.key === FORMS_TASK ? { ...x, status: 'todo', autoDone: false } : x)) };
  t = refreshTrip(t, templates, closed);
  assert.equal(formsTask(t).status, 'todo');
  // a task checked by hand is not un-checked by the roster
  t = { ...t, tasks: t.tasks.map((x) => (x.key === FORMS_TASK ? { ...x, status: 'done', autoDone: false } : x)) };
  t = applyRoster({ ...t, students: [s('A', true), s('B')] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'done');
});

test('backups without students strip every name; calendar files never contain names', () => {
  const t = mk([s('Ana Lopez', true), s('Ben Ng')]);
  const data = { version: 1, trips: [t], settings: { tags: ['Robotics'], rosters: { Robotics: ['Ana Lopez', 'Ben Ng'] } } };
  const out = JSON.stringify(withoutStudents(data));
  assert.ok(!out.includes('Ana Lopez') && !out.includes('Ben Ng'));
  assert.equal(withoutStudents(data).studentsIncluded, false);
  const ics = buildICS(t);
  assert.ok(!ics.includes('Ana') && !ics.includes('Ben Ng'));
});
