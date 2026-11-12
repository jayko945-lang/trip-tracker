// Student roster for one trip: who's going, and whether their permission slip,
// medical form and payment are in. Names are personal information and are
// stored on this device only.
import * as store from '../store.js';
import { ROSTER_CHECKS, FORMS_TASK, rosterStats, missingByCheck } from '../domain.js';
import { esc, icons, sheet, toast, vt, fmtDate } from '../ui.js';
import { rerender } from '../app.js';
import { todayISO } from './common.js';

// "All" or "Missing" filter, remembered while the app is open.
let showMissingOnly = false;

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
const missingAny = (s) => ROSTER_CHECKS.some(([k]) => !s[k]);

function studentRow(s) {
  return `<li class="student"${vt(`st-${s.id}`)}>
    <button class="student-name" data-action="editStudent" data-id="${esc(s.id)}">${esc(s.name)}</button>
    <div class="student-checks">
      ${ROSTER_CHECKS.map(([k, label, short]) => `<button class="scheck ${s[k] ? 'on' : ''}" data-action="check" data-id="${esc(s.id)}" data-k="${k}"
          aria-pressed="${!!s[k]}" aria-label="${esc(label)} for ${esc(s.name)}">${icons.check}<span>${short}</span></button>`).join('')}
    </div>
  </li>`;
}

/** Plain-text list of who's still missing what, for pasting into an email or text. */
function missingText(trip) {
  const miss = missingByCheck(trip);
  const lines = [`${trip.title}: still missing (as of ${fmtDate(todayISO(), { year: false })})`];
  for (const [k, label] of ROSTER_CHECKS) {
    const names = [...miss[k]].sort((x, y) => x.localeCompare(y, undefined, { sensitivity: 'base' }));
    if (names.length) lines.push(`${label} (${names.length}): ${names.join(', ')}`);
  }
  if (lines.length === 1) lines.push('Nothing. Everything is in.');
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into an email or message.');
  } catch {
    // Clipboard blocked: show the text so it can be selected and copied by hand.
    sheet({
      title: 'Copy this text',
      body: `<div class="form"><textarea rows="8" readonly>${esc(text)}</textarea>
        <div class="stack"><button class="btn" data-sa="cancel">Done</button></div></div>`,
    });
  }
}

export default function studentsView(id) {
  const trip = store.getTrip(decodeURIComponent(id));
  if (!trip) return { title: 'Not found', back: '#/trips', html: '<div class="empty"><p>This trip was deleted.</p></div>' };
  const tripHref = `#/trip/${encodeURIComponent(trip.id)}`;
  const st = rosterStats(trip);
  const sorted = [...trip.students].sort(byName);
  const missingCount = sorted.filter(missingAny).length;
  const shown = showMissingOnly ? sorted.filter(missingAny) : sorted;
  const rosters = store.getSettings().rosters;
  const rosterTags = Object.keys(rosters).sort((a, b) => (trip.tags.includes(b) - trip.tags.includes(a)) || a.localeCompare(b));

  let html = '';
  if (st.total) {
    html += `<div class="card roster-summary"${vt('roster-summary')}>
      ${ROSTER_CHECKS.map(([k, label]) => {
        const n = st[k];
        return `<div class="meter"><div class="meter-top"><span>${label}</span><span class="${n === st.total ? 'ok' : ''}">${n}/${st.total}</span></div>
          <div class="meter-bar"><i style="width:${(n / st.total) * 100}%"></i></div></div>`;
      }).join('')}
    </div>
    <div class="segmented roster-filter"${vt('roster-filter')}>
      <label><input type="radio" name="rf" data-action="filter" data-v="all" ${showMissingOnly ? '' : 'checked'}><span>All ${st.total}</span></label>
      <label><input type="radio" name="rf" data-action="filter" data-v="missing" ${showMissingOnly ? 'checked' : ''}><span>Missing something ${missingCount}</span></label>
    </div>`;
    html += shown.length
      ? `<ul class="list students">${shown.map(studentRow).join('')}</ul>`
      : '<p class="muted pad center">Everyone has everything in.</p>';
  } else {
    html += `<div class="empty"><p class="empty-title">No students yet</p>
      <p>Add the students going on this trip to check off permission slips, medical forms and payments.</p></div>`;
  }

  html += `<form class="inline-add add-student" id="add-student"${vt('add-student')}>
      <input name="name" placeholder="Add a student" maxlength="120" autocomplete="off" autocapitalize="words" enterkeyhint="done">
      <button class="btn" type="submit">Add</button>
    </form>
    <div class="stack"${vt('roster-actions')}>
      <button class="btn" data-action="paste">Paste a list of names</button>
      ${rosterTags.length ? '<button class="btn" data-action="fromRoster">Add a saved class or team</button>' : ''}
      ${st.total ? `<button class="btn" data-action="copyMissing">Copy who's missing</button>` : ''}
      ${st.total && trip.tags.length ? '<button class="btn subtle" data-action="saveRoster">Save this list as a class or team roster</button>' : ''}
    </div>
    <p class="muted small center pad">Student names are stored only on this phone.</p>`;

  /** Add names, then say how many were new. */
  function added(text) {
    const n = store.addStudents(trip.id, text);
    rerender();
    toast(n ? `Added ${n} student${n === 1 ? '' : 's'}` : 'Those names are already on the list');
  }

  return {
    title: 'Students',
    back: tripHref,
    right: `<a class="tb-btn" href="${tripHref}">Done</a>`,
    html,
    mount(root) {
      root.querySelector('#add-student').addEventListener('submit', (e) => {
        e.preventDefault();
        const input = e.target.querySelector('[name=name]');
        if (!input.value.trim()) return;
        added(input.value);
        // keep the keyboard up for the next name
        setTimeout(() => document.querySelector('#add-student [name=name]')?.focus(), 50);
      });
    },
    actions: {
      filter(el) {
        showMissingOnly = el.dataset.v === 'missing';
        rerender();
      },
      check(el) {
        const s = trip.students.find((x) => x.id === el.dataset.id);
        if (!s) return;
        const k = el.dataset.k;
        const before = trip.tasks.find((t) => t.key === FORMS_TASK)?.status;
        store.updateStudent(trip.id, s.id, { [k]: !s[k] });
        const after = store.getTrip(trip.id).tasks.find((t) => t.key === FORMS_TASK)?.status;
        rerender();
        if (before === 'todo' && after === 'done') toast('Every slip and medical form is in. Checked off the task.');
        else if (before === 'done' && after === 'todo') toast('A form is missing again. That task is back on your list.');
      },
      editStudent(el) {
        const s = trip.students.find((x) => x.id === el.dataset.id);
        if (!s) return;
        sheet({
          title: s.name,
          body: `<div class="form">
            <label class="field"><span>Name</span><input name="name" value="${esc(s.name)}" maxlength="120" autocapitalize="words"></label>
            <div class="stack">
              <button class="btn primary" data-sa="save">Save</button>
              <button class="btn danger subtle" data-sa="remove">Remove from this trip</button>
              <button class="btn subtle" data-sa="cancel">Cancel</button>
            </div></div>`,
          actions: {
            save(btn, dlg) {
              store.updateStudent(trip.id, s.id, { name: dlg.querySelector('[name=name]').value });
              rerender();
            },
            remove() {
              const removed = store.removeStudent(trip.id, s.id);
              rerender();
              if (removed) toast(`Removed ${s.name}`, { duration: 6000, undo: () => { store.restoreStudent(removed); rerender(); } });
            },
          },
        });
      },
      paste() {
        sheet({
          title: 'Paste a list of names',
          body: `<div class="form">
            <p class="muted small">One name per line, or separated by commas. Numbers and bullets are removed, and names already on the list are skipped.</p>
            <textarea name="names" rows="8" placeholder="Ana Lopez&#10;Ben Ng&#10;Cy Diaz"></textarea>
            <div class="stack"><button class="btn primary" data-sa="add">Add students</button><button class="btn subtle" data-sa="cancel">Cancel</button></div>
          </div>`,
          actions: {
            add(btn, dlg) {
              const text = dlg.querySelector('[name=names]').value;
              if (!text.trim()) return false;
              added(text);
            },
          },
        });
      },
      fromRoster() {
        sheet({
          title: 'Add a saved class or team',
          body: `<div class="stack">
            ${rosterTags.map((tag) => `<button class="btn" data-sa="pick" data-tag="${esc(tag)}">${esc(tag)} (${rosters[tag].length})</button>`).join('')}
            <button class="btn subtle" data-sa="cancel">Cancel</button>
            <p class="muted small">Everyone on the roster is added; names already on this trip are skipped. Remove anyone who isn't going.</p>
          </div>`,
          actions: { pick(btn) { added(rosters[btn.dataset.tag].join('\n')); } },
        });
      },
      copyMissing() { copyText(missingText(trip)); },
      saveRoster() {
        const names = sorted.map((s) => s.name);
        sheet({
          title: 'Save as a roster',
          body: `<div class="stack">
            <p class="muted small">Saves these ${names.length} names so you can add them to future trips in one tap. Replaces any roster already saved for that class or team.</p>
            ${trip.tags.map((tag) => `<button class="btn" data-sa="save" data-tag="${esc(tag)}">${esc(tag)}${rosters[tag] ? ` (replaces ${rosters[tag].length})` : ''}</button>`).join('')}
            <button class="btn subtle" data-sa="cancel">Cancel</button>
          </div>`,
          actions: {
            save(btn) {
              store.setTeamRoster(btn.dataset.tag, names.join('\n'));
              rerender();
              toast(`Saved the ${btn.dataset.tag} roster`);
            },
          },
        });
      },
    },
  };
}
