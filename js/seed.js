// Klamath County School District 2026-27 no-school dates.
// type 'closed'  = no school for students or staff
// type 'workday' = student-free workday (staff only)
// Early-release Fridays are normal school days and are not listed.

export const SCHOOL_YEAR = { start: '2026-08-31', end: '2027-06-10' };

export const SEED_NO_SCHOOL = [
  ['2026-09-07', '2026-09-07', 'Labor Day', 'closed'],
  ['2026-10-09', '2026-10-09', 'Student-free workday', 'workday'],
  ['2026-10-15', '2026-10-15', 'Student-free workday', 'workday'],
  ['2026-10-16', '2026-10-16', 'No school', 'closed'],
  ['2026-11-11', '2026-11-11', 'Veterans Day', 'closed'],
  ['2026-11-20', '2026-11-20', 'Student-free workday', 'workday'],
  ['2026-11-23', '2026-11-27', 'Thanksgiving break', 'closed'],
  ['2026-12-21', '2027-01-01', 'Winter break', 'closed'],
  ['2027-01-18', '2027-01-18', 'MLK Day', 'closed'],
  ['2027-01-22', '2027-01-22', 'Student-free workday', 'workday'],
  ['2027-02-15', '2027-02-15', "Presidents' Day", 'closed'],
  ['2027-03-12', '2027-03-12', 'Student-free workday', 'workday'],
  ['2027-03-18', '2027-03-18', 'Student-free workday', 'workday'],
  ['2027-03-19', '2027-03-19', 'No school', 'closed'],
  ['2027-03-22', '2027-03-26', 'Spring break', 'closed'],
  ['2027-04-30', '2027-04-30', 'Student-free workday', 'workday'],
  ['2027-05-31', '2027-05-31', 'Memorial Day', 'closed'],
].map(([start, end, label, type], i) => ({ id: `seed-${i}`, start, end, label, type }));
