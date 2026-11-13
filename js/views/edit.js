import * as store from '../store.js';
import { KINDS, FLAGS } from '../templates.js';
import { openTasksByBucket, rosterStats } from '../domain.js';
import { esc, toast } from '../ui.js';
import { todayISO } from './common.js';

export default function editView(id) {
  const existing = id ? store.getTrip(decodeURIComponent(id)) : null;
  if (id && !existing) return { title: 'Not found', back: '#/trips', html: '<div class="empty"><p>Trip not found.</p></div>' };
  const t = existing || {
    kind: 'field', title: '', tags: [], startDate: '', endDate: '', destination: '',
    flags: { ...KINDS.field.flags }, studentCount: '', chaperones: [], costPerStudent: '', amountCollected: '', notes: '',
  };
  // With a student list, the count comes from it.
  const roster = existing ? rosterStats(existing) : { total: 0 };
  const countFromRoster = roster.total > 0;
  const allTags = [...new Set([...store.getSettings().tags, ...t.tags])];
  const back = existing ? `#/trip/${encodeURIComponent(existing.id)}` : '#/';

  const tagChip = (tag, on) => `<label class="chip toggle"><input type="checkbox" name="tags" value="${esc(tag)}" ${on ? 'checked' : ''}><span>${esc(tag)}</span></label>`;

  const html = `<form id="trip-form" class="form" novalidate>
    <fieldset class="field">
      <legend>Kind</legend>
      <div class="segmented">
        ${Object.entries(KINDS).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${t.kind === k ? 'checked' : ''}><span>${esc(v.label)}</span></label>`).join('')}
      </div>
    </fieldset>

    <label class="field"><span>Title</span><input name="title" required maxlength="200" value="${esc(t.title)}" placeholder="e.g. OMSI field trip" autocomplete="off"></label>

    <div class="field-row">
      <label class="field"><span>Start date</span><input name="startDate" type="date" required value="${esc(t.startDate)}"></label>
      <label class="field"><span>End date</span><input name="endDate" type="date" value="${esc(t.endDate)}"></label>
    </div>

    <label class="field"><span>Destination</span><input name="destination" maxlength="300" value="${esc(t.destination)}" autocomplete="off"></label>

    <fieldset class="field">
      <legend>Classes or teams</legend>
      <div class="chips" id="tag-chips">${allTags.map((tag) => tagChip(tag, t.tags.includes(tag))).join('')}</div>
      <div class="inline-add">
        <input id="new-tag" placeholder="Add class or team" maxlength="80" autocomplete="off" enterkeyhint="done">
        <button type="button" class="btn" id="add-tag">Add</button>
      </div>
    </fieldset>

    <fieldset class="field">
      <legend>Logistics</legend>
      <div class="toggles">
        ${FLAGS.map((f) => `<label class="switch"><span>${esc(f.label)}</span><input type="checkbox" role="switch" name="flag-${f.key}" ${t.flags[f.key] ? 'checked' : ''}><i></i></label>`).join('')}
      </div>
      <p class="muted small">Changing these adds or removes checklist tasks. Completed tasks are kept.</p>
    </fieldset>

    <div class="field-row">
      <label class="field"><span>Students</span><input name="studentCount" type="number" inputmode="numeric" min="0" step="1" value="${esc(t.studentCount)}"${countFromRoster ? ' readonly' : ''}></label>
      <label class="field"><span>Cost per student</span><input name="costPerStudent" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(t.costPerStudent)}"></label>
    </div>
    <label class="field"><span>Amount collected</span><input name="amountCollected" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(t.amountCollected)}"></label>
    ${countFromRoster ? `<p class="muted small">The student count comes from this trip's student list.</p>` : ''}

    <label class="field"><span>Chaperones (one per line)</span><textarea name="chaperones" rows="3">${esc(t.chaperones.join('\n'))}</textarea></label>

    <label class="field"><span>Notes</span><textarea name="notes" rows="4" placeholder="Contacts, times, reminders">${esc(t.notes)}</textarea></label>
    <p class="muted small">Add student names on the trip's Students screen (they stay on this phone). Don't enter grades or medical details.</p>

    <p class="form-error" id="form-error" role="alert"></p>
    <div class="stack">
      <button class="btn primary" type="submit">${existing ? 'Save changes' : 'Create trip'}</button>
      <a class="btn" href="${back}">Cancel</a>
    </div>
  </form>`;

  function mount(root) {
    const form = root.querySelector('#trip-form');
    // Picking a kind presets the flags (user can still change them).
    form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => {
      const flags = KINDS[r.value].flags;
      for (const f of FLAGS) form.querySelector(`[name=flag-${f.key}]`).checked = !!flags[f.key];
    }));
    const start = form.querySelector('[name=startDate]');
    const end = form.querySelector('[name=endDate]');
    start.addEventListener('change', () => { if (!end.value || end.value < start.value) end.value = start.value; });

    const addTag = () => {
      const input = form.querySelector('#new-tag');
      const v = input.value.trim();
      if (!v) return;
      const existingBox = [...form.querySelectorAll('[name=tags]')].find((b) => b.value.toLowerCase() === v.toLowerCase());
      if (existingBox) existingBox.checked = true;
      else form.querySelector('#tag-chips').insertAdjacentHTML('beforeend', tagChip(v, true));
      input.value = '';
    };
    form.querySelector('#add-tag').addEventListener('click', addTag);
    form.querySelector('#new-tag').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const err = form.querySelector('#form-error');
      const title = String(fd.get('title') || '').trim();
      const startDate = String(fd.get('startDate') || '');
      let endDate = String(fd.get('endDate') || '') || startDate;
      if (!title) { err.textContent = 'Add a title.'; form.querySelector('[name=title]').focus(); return; }
      if (!startDate) { err.textContent = 'Pick a start date.'; start.focus(); return; }
      if (endDate < startDate) endDate = startDate;
      const flags = {};
      for (const f of FLAGS) flags[f.key] = fd.get(`flag-${f.key}`) === 'on';
      const saved = store.saveTrip({
        ...(existing ? { id: existing.id } : {}),
        title, startDate, endDate, kind: fd.get('kind'), flags,
        destination: String(fd.get('destination') || '').trim(),
        tags: fd.getAll('tags').map(String),
        studentCount: fd.get('studentCount'),
        costPerStudent: fd.get('costPerStudent'),
        amountCollected: fd.get('amountCollected'),
        chaperones: String(fd.get('chaperones') || '').split('\n'),
        notes: String(fd.get('notes') || ''),
      });
      const overdue = openTasksByBucket([saved], todayISO()).overdue.length;
      toast(overdue ? `Saved. ${overdue} task${overdue === 1 ? ' is' : 's are'} already overdue.` : 'Saved', { duration: overdue ? 6000 : 2500 });
      location.hash = `#/trip/${encodeURIComponent(saved.id)}`;
    });
  }

  return { title: existing ? 'Edit trip' : 'New trip', back, html, mount };
}
