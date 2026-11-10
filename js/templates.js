// District task template. Lead times and labels can be overridden in
// Settings; the "requires" rules are fixed here.
//   unit: 'school' (school days) | 'calendar' (calendar days) | 'manual'
//   requires: { flag } or { kind } — task only applies when it matches
//   hard: true marks a hard deadline

export const DEFAULT_TEMPLATES = [
  // 10 school days before
  { key: 'calendarCheck', unit: 'school', n: 10, label: 'Check school calendar for conflicts' },
  { key: 'calendarRequest', unit: 'school', n: 10, label: 'Calendar request submitted',
    hint: 'Dates, release and return times, itinerary with contacts, non-bus needs' },
  { key: 'busRequest', unit: 'school', n: 10, label: 'Bus request submitted', requires: { flag: 'bus' } },
  { key: 'aesop', unit: 'school', n: 10, label: 'AESOP absence request created' },
  { key: 'chaperonesIdentified', unit: 'school', n: 10, label: 'Approved chaperones identified',
    hint: 'From the district volunteer list' },
  { key: 'itineraryPacket', unit: 'school', n: 10, label: 'Itinerary packet submitted', hard: true,
    hint: 'With student list and chaperone list. Event is canceled without it.' },
  { key: 'overnightForm', unit: 'school', n: 10, label: 'Overnight form submitted',
    requires: { flag: 'overnight' } },
  // 5 school days before
  { key: 'permissionHandout', unit: 'school', n: 5, label: 'Permission slips and medical forms handed out' },
  { key: 'parentEmail', unit: 'school', n: 5, label: 'Emails to parents sent' },
  { key: 'busConfirmed', unit: 'school', n: 5, label: 'Bus confirmed', requires: { flag: 'bus' } },
  { key: 'chaperonesConfirmed', unit: 'school', n: 5, label: 'Chaperones confirmed' },
  { key: 'officeStudentList', unit: 'school', n: 5, label: 'Attending-student list emailed to office',
    hint: 'Include release and return times' },
  { key: 'eligibilityRequested', unit: 'school', n: 5, label: 'Grade eligibility check requested' },
  { key: 'ineligibleTalk', unit: 'school', n: 5, label: 'Talk to ineligible students' },
  // 1 school day before
  { key: 'permissionDue', unit: 'school', n: 1, label: 'Permission slips and medical forms collected' },
  { key: 'coverage', unit: 'school', n: 1, label: 'Substitute or class coverage confirmed' },
  { key: 'selfDriveForms', unit: 'school', n: 1, label: "Self-driving students' forms verified",
    requires: { flag: 'studentsSelfDriving' } },
  // Day of
  { key: 'attendanceList', unit: 'school', n: 0, label: 'Attendance list turned in to office',
    hint: 'Students actually attending' },
  { key: 'behaviorReminder', unit: 'school', n: 0, label: 'Remind students of behavior expectations' },
  // Calendar days
  { key: 'travelBooked', unit: 'calendar', n: 28, label: 'Flights and rental car booked',
    requires: { flag: 'needsFlightsOrRentalCar' } },
  // Robotics only, manual dates
  { key: 'eventRegistration', unit: 'manual', label: 'Event registration',
    hint: 'Deadline from the event or the robotics coordinator calendar', requires: { kind: 'robotics' } },
  { key: 'eventPayment', unit: 'manual', label: 'Event payment',
    hint: 'Deadline from the event or the robotics coordinator calendar', requires: { kind: 'robotics' } },
];

export const KINDS = {
  field: { label: 'Field trip', flags: { overnight: false, bus: true, studentsSelfDriving: false, needsFlightsOrRentalCar: false } },
  robotics: { label: 'Robotics event', flags: { overnight: false, bus: true, studentsSelfDriving: false, needsFlightsOrRentalCar: false } },
  overnight: { label: 'Overnight trip', flags: { overnight: true, bus: true, studentsSelfDriving: false, needsFlightsOrRentalCar: false } },
};

export const FLAGS = [
  { key: 'overnight', label: 'Overnight' },
  { key: 'bus', label: 'School bus' },
  { key: 'studentsSelfDriving', label: 'Students self-driving' },
  { key: 'needsFlightsOrRentalCar', label: 'Flights or rental car' },
];

/** Defaults merged with the user's overrides from Settings. */
export function getTemplates(overrides = {}) {
  return DEFAULT_TEMPLATES.map((t) => {
    const o = overrides[t.key] || {};
    const merged = { ...t };
    if (typeof o.label === 'string' && o.label.trim()) merged.label = o.label.trim();
    if (t.unit !== 'manual') {
      if (o.unit === 'school' || o.unit === 'calendar') merged.unit = o.unit;
      if (Number.isFinite(o.n) && o.n >= 0) merged.n = Math.floor(o.n);
    }
    return merged;
  });
}

export function templateApplies(tpl, trip) {
  const r = tpl.requires;
  if (!r) return true;
  if (r.kind) return trip.kind === r.kind;
  if (r.flag) return !!trip.flags?.[r.flag];
  return true;
}
