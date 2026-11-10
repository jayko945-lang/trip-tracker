// Build an .ics calendar file for one trip: the event itself plus each
// task with a due date, as all-day events with a 7 AM alert.
import { addDays } from './dates.js';
import { effectiveDue } from './domain.js';

const esc = (s = '') => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const ymd = (iso) => iso.replace(/-/g, '');

function fold(line) {
  // RFC 5545: lines over 75 octets are folded. Folding by characters is
  // close enough for this content; keep chunks short to stay under the limit.
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  for (let i = 75; i < line.length; i += 74) parts.push(' ' + line.slice(i, i + 74));
  return parts.join('\r\n');
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

export function buildICS(trip) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Trip Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
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
    lines.push(...vevent({
      uid: `task-${trip.id}-${task.key}@trip-tracker`,
      start: due,
      end: due,
      summary: `${task.status === 'done' ? '✓ ' : ''}${task.label} — ${trip.title}`,
      description: `Paperwork for ${trip.title} (${trip.startDate})`,
      alarm: task.status !== 'done',
    }));
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
