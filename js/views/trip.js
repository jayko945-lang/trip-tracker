import * as store from '../store.js';
import { KINDS, FLAGS } from '../templates.js';
import { effectiveDue, chaperoneCheck, ruleText, tripProgress, isOpen, bucketFor, rosterStats, ROSTER_CHECKS } from '../domain.js';
import { buildICS } from '../ics.js';
import { esc, fmtDate, fmtRange, relDays, money, icons, sheet, toast, saveFile, vt } from '../ui.js';
import { rerender } from '../app.js';
import { taskRow, todayISO } from './common.js';

function checklist(trip, today, tplByKey) {
  const rule = (t) => (t.custom ? 'Custom task' : t.dueOverride ? 'Custom date' : ruleText(tplByKey.get(t.key)));
  const active = trip.tasks.filter((t) => !t.inactive);
  const retired = trip.tasks.filter((t) => t.inactive);
  const groups = new Map();
  for (const t of active) {
    const due = effectiveDue(t) || '';
    if (!groups.has(due)) groups.set(due, []);
    groups.get(due).push(t);
  }
  const dates = [...groups.keys()].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));
  let html = '';
  for (const d of dates) {
    const list = groups.get(d);
    const open = list.some(isOpen);
    const overdue = open && list.some((t) => isOpen(t) && bucketFor(t, today) === 'overdue');
    const head = d
      ? `${fmtDate(d)} <span class="rel ${overdue ? 'danger' : ''}">${open ? relDays(d, today) : 'Done'}</span>`
      : 'Needs a due date';
    html += `<section class="group"><h3 class="group-title small"${vt(`d-${d || 'none'}`)}>${head}</h3>
      <ul class="tasks">${list.map((t) => taskRow(trip, t, { today, rule: rule(t) })).join('')}</ul></section>`;
  }
  if (retired.length) {
    html += `<section class="group"><h3 class="group-title small"${vt('d-retired')}>Completed, no longer required</h3>
      <ul class="tasks">${retired.map((t) => taskRow(trip, t, { today })).join('')}</ul></section>`;
  }
  return html;
}

/** Summary of the roster with a link to the Students screen. */
function studentsCard(trip) {
  const st = rosterStats(trip);
  const href = `#/trip/${encodeURIComponent(trip.id)}/students`;
  const body = st.total
    ? ROSTER_CHECKS.map(([k, label]) => `<div class="meter"><div class="meter-top"><span>${label}</span>
        <span class="${st[k] === st.total ? 'ok' : ''}">${st[k]}/${st.total}</span></div>
        <div class="meter-bar"><i style="width:${(st[k] / st.total) * 100}%"></i></div></div>`).join('')
    : '<p class="muted small">Add students to check off permission slips, medical forms and payments.</p>';
  return `<a class="card students-card" href="${href}"${vt('students-card')}>
    <span class="students-head"><span>Students${st.total ? ` <span class="count">${st.total}</span>` : ''}</span>${icons.chevron}</span>
    ${body}</a>`;
}

export default function tripView(id) {
  const trip = store.getTrip(decodeURIComponent(id));
  if (!trip) {
    return { title: 'Not found', back: '#/trips', html: '<div class="empty"><p>This trip was deleted.</p><a class="btn" href="#/trips">All trips</a></div>' };
  }
  const today = todayISO();
  const { templates } = store.context();
  const tplByKey = new Map(templates.map((t) => [t.key, t]));
  const ratio = chaperoneCheck(trip);
  const p = tripProgress(trip);
  const expected = trip.costPerStudent * trip.studentCount;
  const flagsOn = FLAGS.filter((f) => trip.flags[f.key]);

  const ratioWarn = !ratio.ok
    ? `<div class="banner ${ratio.overnight ? 'danger' : 'warn'}">${icons.warn}<span>
        <strong>${ratio.overnight ? 'Chaperones required' : 'More chaperones recommended'}:</strong>
        ${ratio.students} students need at least ${ratio.needed} (1 per ${ratio.per}${ratio.overnight ? ', overnight' : ''}). You have ${ratio.have}.
      </span></div>`
    : '';

  const html = `<div class="detail">
    <div class="d-info">
    ${ratioWarn}
    <div class="card info">
      <p class="trip-sub">${esc(KINDS[trip.kind].label)} · ${fmtRange(trip.startDate, trip.endDate)}</p>
      ${trip.destination ? `<p class="dest">${esc(trip.destination)}</p>` : ''}
      ${trip.tags.length ? `<div class="chips">${trip.tags.map((t) => `<span class="chip small">${esc(t)}</span>`).join('')}</div>` : ''}
      ${flagsOn.length ? `<div class="chips">${flagsOn.map((f) => `<span class="chip small flag">${esc(f.label)}</span>`).join('')}</div>` : ''}
      <dl class="stats">
        <div><dt>Students</dt><dd>${trip.studentCount}</dd></div>
        <div><dt>Chaperones</dt><dd class="${ratio.ok ? '' : 'danger'}">${ratio.have}${ratio.needed ? ` / ${ratio.needed}` : ''}</dd></div>
        <div><dt>Checklist</dt><dd>${p.done}/${p.total}</dd></div>
      </dl>
      ${trip.chaperones.length ? `<p class="muted small">Chaperones: ${trip.chaperones.map(esc).join(', ')}</p>` : ''}
      ${trip.costPerStudent || trip.amountCollected ? `
      <dl class="stats">
        <div><dt>Per student</dt><dd>${money(trip.costPerStudent)}</dd></div>
        <div><dt>Collected</dt><dd>${money(trip.amountCollected)}</dd></div>
        <div><dt>Outstanding</dt><dd class="${expected - trip.amountCollected > 0 ? 'warn' : ''}">${money(Math.max(0, expected - trip.amountCollected))}</dd></div>
      </dl>` : ''}
    </div>
    ${studentsCard(trip)}

    </div>
    <div class="d-list">
    <h2 class="section-title">Checklist</h2>
    ${checklist(trip, today, tplByKey)}
    <div class="row-buttons"${vt('rowbuttons')}>
      <button class="btn" data-action="addTask">Add task</button>
      <button class="btn" data-action="ics">Add to Calendar</button>
    </div>

    </div>
    <div class="d-notes"${vt('notes')}>${trip.notes ? `<h2 class="section-title">Notes</h2><div class="card notes">${esc(trip.notes)}</div>` : ''}</div>

    <div class="stack spaced d-actions"${vt('actions')}>
      <a class="btn" href="#/edit/${encodeURIComponent(trip.id)}">Edit trip</a>
      <button class="btn danger subtle" data-action="delete">Delete trip</button>
    </div>
  </div>`;

  return {
    title: trip.title,
    back: '#/trips',
    right: `<a class="tb-btn" href="#/edit/${encodeURIComponent(trip.id)}">Edit</a>`,
    html,
    actions: {
      toggle(el) {
        const t = trip.tasks.find((x) => x.key === el.dataset.key);
        if (!t) return;
        store.updateTask(trip.id, t.key, { status: t.status === 'todo' ? 'done' : 'todo' });
        rerender();
      },
      taskMenu(el) {
        const t = trip.tasks.find((x) => x.key === el.dataset.key);
        if (t) taskSheet(trip, t, tplByKey.get(t.key));
      },
      addTask() {
        sheet({
          title: 'Add a task',
          body: `<form class="form" onsubmit="return false">
            <label class="field"><span>Task</span><input name="label" required maxlength="200" autocomplete="off"></label>
            <label class="field"><span>Due date (optional)</span><input name="due" type="date"></label>
            <div class="stack"><button class="btn primary" data-sa="save">Add</button><button class="btn" data-sa="cancel">Cancel</button></div>
          </form>`,
          actions: {
            save(btn, dlg) {
              const label = dlg.querySelector('[name=label]').value.trim();
              if (!label) { dlg.querySelector('[name=label]').focus(); return false; }
              store.addCustomTask(trip.id, label, dlg.querySelector('[name=due]').value);
              rerender();
            },
          },
        });
      },
      async ics() {
        const name = `${trip.title.replace(/[^\w\- ]+/g, '').trim() || 'trip'}.ics`;
        await saveFile(name, 'text/calendar', buildICS(trip));
      },
      delete() {
        const removed = store.deleteTrip(trip.id);
        location.hash = '#/trips';
        if (removed) {
          toast(`Deleted “${trip.title}”`, {
            duration: 7000,
            undo: () => { store.restoreTrip(removed); location.hash = `#/trip/${encodeURIComponent(trip.id)}`; },
          });
        }
      },
    },
  };
}

function taskSheet(trip, task, tpl) {
  const computed = task.dueDate;
  const manual = task.custom || !tpl || tpl.unit === 'manual';
  const rule = task.custom ? 'Custom task' : ruleText(tpl);
  const body = `<div class="form">
    ${tpl?.hint ? `<p class="muted">${esc(tpl.hint)}</p>` : ''}
    <p class="rule"><strong>${esc(rule)}</strong>${computed ? ` → ${fmtDate(computed, { year: true })}` : ''}</p>
    <label class="field"><span>${manual ? 'Due date' : 'Override due date'}</span>
      <input type="date" name="due" value="${esc(task.dueOverride || computed || '')}"></label>
    <label class="field"><span>Note</span>
      <textarea name="note" rows="2" maxlength="1000" placeholder="e.g. Bus confirmation #, who you emailed">${esc(task.note || '')}</textarea></label>
    <div class="stack">
      <button class="btn primary" data-sa="saveDate">Save</button>
      ${task.dueOverride && !manual ? '<button class="btn" data-sa="clearDate">Use computed date</button>' : ''}
      ${task.status === 'done'
        ? '<button class="btn" data-sa="todo">Mark not done</button>'
        : '<button class="btn" data-sa="done">Mark done</button>'}
      ${task.status === 'na'
        ? '<button class="btn" data-sa="todo">Restore to to-do</button>'
        : '<button class="btn" data-sa="na">Not applicable for this trip</button>'}
      ${task.custom ? '<button class="btn danger subtle" data-sa="remove">Delete task</button>' : ''}
      <button class="btn subtle" data-sa="cancel">Close</button>
    </div>
    ${task.completedAt ? `<p class="muted small">Completed ${esc(new Date(task.completedAt).toLocaleString())}</p>` : ''}
  </div>`;
  const dlg = sheet({
    title: task.label,
    body,
    actions: {
      saveDate(btn, dlg) {
        const v = dlg.querySelector('[name=due]').value || null;
        store.updateTask(trip.id, task.key, { dueOverride: v && v !== computed ? v : null });
        rerender();
      },
      clearDate() { store.updateTask(trip.id, task.key, { dueOverride: null }); rerender(); },
      done() { store.updateTask(trip.id, task.key, { status: 'done' }); rerender(); },
      todo() { store.updateTask(trip.id, task.key, { status: 'todo' }); rerender(); },
      na() { store.updateTask(trip.id, task.key, { status: 'na' }); rerender(); },
      remove() {
        const removed = store.deleteTask(trip.id, task.key);
        rerender();
        if (removed) toast('Task deleted', { duration: 6000, undo: () => { store.restoreTask(removed); rerender(); } });
      },
    },
  });
  // The note saves however the sheet is closed (any button, or tapping outside).
  const noteEl = dlg.querySelector('[name=note]');
  dlg.addEventListener('close', () => {
    const note = noteEl.value.trim();
    const current = store.getTrip(trip.id)?.tasks.find((t) => t.key === task.key);
    if (current && note !== (current.note || '')) {
      store.updateTask(trip.id, task.key, { note });
      rerender();
    }
  });
}
