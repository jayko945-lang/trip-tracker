import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  schoolDaysBefore, calendarDaysBefore, buildClosedSet, isSchoolDay,
  dueFromRule, expandRange, isISODate, dayOfWeek, addDays, daysBetween,
} from '../js/dates.js';
import { SEED_NO_SCHOOL } from '../js/seed.js';

const closed = buildClosedSet(SEED_NO_SCHOOL); // workdays NOT counted (default)
const closedWorkdaysCount = buildClosedSet(SEED_NO_SCHOOL, { workdaysCountAsSchool: true });
const none = new Set();

test('REQUIRED: event Thu 2027-01-07, 10 school days before = Thu 2026-12-10', () => {
  assert.equal(dayOfWeek('2027-01-07'), 4);
  assert.equal(schoolDaysBefore('2027-01-07', 10, closed), '2026-12-10');
  assert.equal(dayOfWeek('2026-12-10'), 4);
});

test('N = 0 returns the event date itself', () => {
  assert.equal(schoolDaysBefore('2027-01-07', 0, closed), '2027-01-07');
  // even if the event is on a weekend
  assert.equal(schoolDaysBefore('2027-01-09', 0, closed), '2027-01-09');
});

test('event date itself is never counted', () => {
  // Wed -> 1 school day before is Tue
  assert.equal(schoolDaysBefore('2026-12-09', 1, none), '2026-12-08');
});

test('skips weekends', () => {
  // Monday event, 1 school day before = previous Friday
  assert.equal(schoolDaysBefore('2026-12-14', 1, none), '2026-12-11');
  // Monday event, 5 school days before = previous Monday
  assert.equal(schoolDaysBefore('2026-12-14', 5, none), '2026-12-07');
});

test('Saturday event counts back from Friday', () => {
  // Sat 2027-02-06: 1 before = Fri 02-05
  assert.equal(schoolDaysBefore('2027-02-06', 1, closed), '2027-02-05');
});

test('skips single holidays (Veterans Day)', () => {
  // Thu 2026-11-12, 1 school day before skips Wed 11-11 -> Tue 11-10
  assert.equal(schoolDaysBefore('2026-11-12', 1, closed), '2026-11-10');
});

test('skips ranges (Thanksgiving week)', () => {
  // Mon 2026-11-30, 1 before: Fri 11-27..Mon 11-23 closed, Fri 11-20 workday (not counted) -> Thu 11-19
  assert.equal(schoolDaysBefore('2026-11-30', 1, closed), '2026-11-19');
  // With workdays counted as school days -> Fri 11-20
  assert.equal(schoolDaysBefore('2026-11-30', 1, closedWorkdaysCount), '2026-11-20');
});

test('student-free workdays toggle', () => {
  assert.equal(isSchoolDay('2026-10-09', closed), false);
  assert.equal(isSchoolDay('2026-10-09', closedWorkdaysCount), true);
  // Closed days stay closed either way
  assert.equal(isSchoolDay('2026-10-16', closedWorkdaysCount), false);
});

test('early-release Fridays are school days', () => {
  assert.equal(isSchoolDay('2026-12-11', closed), true);
});

test('spring break plus adjacent days off', () => {
  // Mon 2027-03-29, 1 before: 3/22-3/26 break, 3/19 closed, 3/18 workday -> Wed 3/17
  assert.equal(schoolDaysBefore('2027-03-29', 1, closed), '2027-03-17');
  assert.equal(schoolDaysBefore('2027-03-29', 1, closedWorkdaysCount), '2027-03-18');
});

test('10 school days back across Thanksgiving', () => {
  // Fri 2026-12-04. Back: 12/3,12/2,12/1,11/30 (4), skip 11/23-27, 11/20 workday,
  // 11/19,18,17,16 (8), 11/13,12 (10)
  assert.equal(schoolDaysBefore('2026-12-04', 10, closed), '2026-11-12');
});

test('calendar days', () => {
  assert.equal(calendarDaysBefore('2027-01-07', 28), '2026-12-10');
  assert.equal(calendarDaysBefore('2027-03-01', 1), '2027-02-28');
});

test('dueFromRule', () => {
  assert.equal(dueFromRule({ unit: 'school', n: 10 }, '2027-01-07', closed), '2026-12-10');
  assert.equal(dueFromRule({ unit: 'calendar', n: 28 }, '2027-01-07', closed), '2026-12-10');
  assert.equal(dueFromRule({ unit: 'manual' }, '2027-01-07', closed), null);
  assert.equal(dueFromRule({ unit: 'school', n: 5 }, '', closed), null);
});

test('helpers', () => {
  assert.equal(isISODate('2027-02-30'), false);
  assert.equal(isISODate('2027-02-28'), true);
  assert.equal(expandRange('2026-12-30', '2027-01-02').length, 4);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-11-10', '2026-11-17'), 7);
  // DST boundary does not break day math
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
  assert.equal(daysBetween('2027-03-13', '2027-03-15'), 2);
});
