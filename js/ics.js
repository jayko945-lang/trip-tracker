// Build an .ics calendar file for one trip: the event itself plus each
// task with a due date, as all-day events with a 7 AM alert.
import { addDays } from './dates.js';
import { effectiveDue } from './domain.js';

const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso) => iso.replace(/-/g, '');

const utf8 = new TextEncoder();

/** RFC 5545: fold lines longer than 75 bytes, never splitting a character. */
function fold(line) {
  if (utf8.encode(line).length <= 75) return line;
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = utf8.encode(ch).length;
    const limit = parts.length ? 74 : 75; // continuation lines start with a space
    if (bytes + n > limit) { parts.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

function stamp(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function vevent({ uid, start, end, summary, description, alarm }) {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp()}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(addDays(end, 1))}`,
    `SUMMARY:${esc(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${esc(description)}`);
  if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(summary)}`, 'TRIGGER:PT7H', 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}

function tripEvents(trip) {
  const lines = [];
  if (trip.startDate) {
    lines.push(...vevent({
      uid: `trip-${trip.id}@trip-tracker`,
      start: trip.startDate,
      end: trip.endDate || trip.startDate,
      summary: trip.title,
      description: trip.destination ? `Destination: ${trip.destination}` : '',
    }));
  }
  for (const task of trip.tasks || []) {
    const due = effectiveDue(task);
    if (!due || task.inactive || task.status === 'na') continue;
    const desc = [`Paperwork for ${trip.title} (${trip.startDate})`];
    if (task.note) desc.push(`Note: ${task.note}`);
    lines.push(...vevent({
      uid: `task-${trip.id}-${task.key}@trip-tracker`,
      start: due,
      end: due,
      summary: `${task.status === 'done' ? '✓ ' : ''}${task.label} — ${trip.title}`,
      description: desc.join('\n'),
      alarm: task.status !== 'done',
    }));
  }
  return lines;
}

/** One trip or an array of trips → one .ics file. */
export function buildICS(trips) {
  const list = Array.isArray(trips) ? trips : [trips];
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trip Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  for (const trip of list) lines.push(...tripEvents(trip));
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
