import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTemplates, KINDS } from '../js/templates.js';
import { refreshTrip, parseNames, rosterStats, missingByCheck, applyRoster, withoutStudents, FORMS_TASK } from '../js/domain.js';
import { buildClosedSet } from '../js/dates.js';
import { SEED_NO_SCHOOL } from '../js/seed.js';
import { buildICS } from '../js/ics.js';

const closed = buildClosedSet(SEED_NO_SCHOOL);
const templates = getTemplates();
const mk = (students, extra = {}) => refreshTrip({
  id: 't', title: 'Trip', kind: 'field', tags: [], startDate: '2027-01-07', endDate: '2027-01-07',
  flags: { ...KINDS.field.flags }, studentCount: 0, chaperones: [], costPerStudent: 0, amountCollected: 0, tasks: [], students, ...extra,
}, templates, closed);
const s = (name, slip = false, medical = false, paid = false) => ({ id: name, name, slip, medical, paid });
const formsTask = (t) => t.tasks.find((x) => x.key === FORMS_TASK);

test('parseNames: lines, commas, numbering, bullets, duplicates, existing names', () => {
  assert.deepEqual(parseNames('1. Ana Lopez\n2) Ben  Ng\n- Cy Diaz, Dee Fox; ana lopez\n\n'), ['Ana Lopez', 'Ben Ng', 'Cy Diaz', 'Dee Fox']);
  assert.deepEqual(parseNames('Ana Lopez\nEd Kim', ['Ana Lopez']), ['Ed Kim']);
  assert.deepEqual(parseNames('   '), []);
});

test('rosterStats and missing lists', () => {
  const t = mk([s('A', true, true, true), s('B', true, false), s('C')]);
  const st = rosterStats(t);
  assert.equal(st.total, 3); assert.equal(st.slip, 2); assert.equal(st.medical, 1); assert.equal(st.paid, 1);
  assert.equal(st.formsIn, 1); assert.equal(st.allFormsIn, false);
  assert.deepEqual(missingByCheck(t), { slip: ['C'], medical: ['B', 'C'], paid: ['B', 'C'] });
});

test('student count follows the roster', () => {
  assert.equal(mk([s('A'), s('B'), s('C')], { studentCount: 40 }).studentCount, 3);
  assert.equal(mk([], { studentCount: 40 }).studentCount, 40); // no roster: manual count kept
});

test('amount collected = paid x cost once anyone is marked paid', () => {
  assert.equal(mk([s('A', 0, 0, true), s('B', 0, 0, true), s('C')], { costPerStudent: 12.5, amountCollected: 5 }).amountCollected, 25);
  assert.equal(mk([s('A'), s('B')], { costPerStudent: 12, amountCollected: 30 }).amountCollected, 30); // nobody paid yet: manual kept
});

test('forms task checks itself off when every slip and medical form is in, only on roster changes', () => {
  let t = mk([s('A', true, true), s('B', true, false)]);
  assert.equal(formsTask(t).status, 'todo');
  t = applyRoster({ ...t, students: [s('A', true, true), s('B', true, true)] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'done');
  assert.equal(formsTask(t).autoDone, true);
  // a form is unmarked -> task goes back to to-do (it was auto-completed)
  t = applyRoster({ ...t, students: [s('A', true, true), s('B', false, true)] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'todo');
  // unchecking the task by hand while all forms are in sticks across normal refreshes
  t = applyRoster({ ...t, students: [s('A', true, true), s('B', true, true)] }, { formsChanged: true });
  t = { ...t, tasks: t.tasks.map((x) => (x.key === FORMS_TASK ? { ...x, status: 'todo', autoDone: false } : x)) };
  t = refreshTrip(t, templates, closed);
  assert.equal(formsTask(t).status, 'todo');
  // a task checked by hand is not un-checked by the roster
  t = { ...t, tasks: t.tasks.map((x) => (x.key === FORMS_TASK ? { ...x, status: 'done', autoDone: false } : x)) };
  t = applyRoster({ ...t, students: [s('A', true, true), s('B')] }, { formsChanged: true });
  assert.equal(formsTask(t).status, 'done');
});

test('backups without students strip every name; calendar files never contain names', () => {
  const t = mk([s('Ana Lopez', true, true), s('Ben Ng')]);
  const data = { version: 1, trips: [t], settings: { tags: ['Robotics'], rosters: { Robotics: ['Ana Lopez', 'Ben Ng'] } } };
  const out = JSON.stringify(withoutStudents(data));
  assert.ok(!out.includes('Ana Lopez') && !out.includes('Ben Ng'));
  assert.equal(withoutStudents(data).studentsIncluded, false);
  const ics = buildICS(t);
  assert.ok(!ics.includes('Ana') && !ics.includes('Ben Ng'));
});
