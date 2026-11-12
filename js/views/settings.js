import * as store from '../store.js';
import { DEFAULT_TEMPLATES, getTemplates } from '../templates.js';
import { isISODate, daysBetween } from '../dates.js';
import { esc, fmtDate, fmtRange, sheet, confirmSheet, toast, saveFile, icons } from '../ui.js';
import { SCHOOL_YEAR } from '../seed.js';
import { rerender, screenInfo } from '../app.js';
import { BACKUP_REMINDER_DAYS, todayISO } from './common.js';

const GROUP_ORDER = (t) => (t.unit === 'manual' ? 1e6 : t.unit === 'calendar' ? 1e5 + t.n : -t.n);

export default function settingsView() {
  const s = store.getSettings();
  const today = todayISO();
  const templates = getTemplates(s.templateOverrides);
  const noSchool = [...s.noSchool].sort((a, b) => a.start.localeCompare(b.start));
  const last = s.lastBackupAt;
  const backupAge = last ? daysBetween(last.slice(0, 10), today) : null;
  const stale = backupAge === null || backupAge >= BACKUP_REMINDER_DAYS;

  const html = `<div class="panes"><div class="pane">
  <h2 class="section-title">Backup</h2>
  <div class="card">
    <p class="${stale ? 'warn' : ''}">${last
      ? `Last backed up <strong>${fmtDate(last.slice(0, 10), { year: true })}</strong> (${backupAge === 0 ? 'today' : `${backupAge} day${backupAge === 1 ? '' : 's'} ago`})`
      : '<strong>Never backed up</strong>'}</p>
    <p class="muted small">iPhone may clear web app data if storage runs low. Export a backup to Files at least monthly. Student names are left out unless you choose to include them.</p>
    <div class="stack">
      <button class="btn primary" data-action="export">Export backup (JSON)</button>
      <button class="btn" data-action="import">Import backup</button>
      <input type="file" id="import-file" accept="application/json,.json" hidden>
    </div>
  </div>

  <h2 class="section-title">No-school calendar</h2>
  <div class="card">
    <p class="muted small">Student year ${fmtRange(SCHOOL_YEAR.start, SCHOOL_YEAR.end)}. Weekends never count. Early-release days count as school days.</p>
    <label class="switch"><span>Student-free workdays count as school days</span>
      <input type="checkbox" role="switch" id="workdays-toggle" ${s.workdaysCountAsSchool ? 'checked' : ''}><i></i></label>
  </div>
  <ul class="list">
    ${noSchool.map((e) => `<li><button class="list-row" data-action="editDay" data-id="${esc(e.id)}">
      <span class="list-main"><span>${esc(e.label || 'No school')}</span>
      <span class="muted small">${fmtRange(e.start, e.end)}</span></span>
      <span class="badge ${e.type === 'workday' ? '' : 'neutral'}">${e.type === 'workday' ? 'Workday' : 'No students'}</span>
      ${icons.chevron}</button></li>`).join('')}
  </ul>
  <div class="stack"><button class="btn" data-action="addDay">Add no-school date</button></div>

  </div><div class="pane">
  <h2 class="section-title">Classes and teams</h2>
  <div class="card">
    <div class="chips">${s.tags.length
      ? s.tags.map((t) => `<button class="chip" data-action="editTag" data-tag="${esc(t)}">${esc(t)}${s.rosters[t] ? ` <span class="count">${s.rosters[t].length}</span>` : ''}</button>`).join('')
      : '<span class="muted small">None yet.</span>'}</div>
    <form class="inline-add" id="tag-form">
      <input name="tag" placeholder="Add class or team" maxlength="80" autocomplete="off" enterkeyhint="done">
      <button class="btn" type="submit">Add</button>
    </form>
  </div>

  <h2 class="section-title">Lead times</h2>
  <p class="muted small pad">Counted back from the trip start date. Changes update every trip.</p>
  <ul class="list templates" id="templates">
    ${[...templates].sort((a, b) => GROUP_ORDER(a) - GROUP_ORDER(b)).map((t) => `<li class="tpl">
      <input class="tpl-label" data-key="${t.key}" data-field="label" value="${esc(t.label)}" aria-label="Task label" maxlength="300">
      ${t.unit === 'manual'
        ? `<span class="muted small">Manual date${t.requires?.kind ? ' · robotics only' : ''}</span>`
        : `<div class="tpl-rule">
            <input type="number" inputmode="numeric" min="0" max="365" data-key="${t.key}" data-field="n" value="${t.n}" aria-label="Number of days">
            <select data-key="${t.key}" data-field="unit" aria-label="Unit">
              <option value="school" ${t.unit === 'school' ? 'selected' : ''}>school days before</option>
              <option value="calendar" ${t.unit === 'calendar' ? 'selected' : ''}>calendar days before</option>
            </select>
            ${t.requires?.flag ? `<span class="muted small">only if ${esc(t.requires.flag.replace(/([A-Z])/g, ' $1').toLowerCase())}</span>` : ''}
          </div>`}
    </li>`).join('')}
  </ul>
  <div class="stack"><button class="btn subtle" data-action="resetTemplates">Reset lead times to defaults</button></div>

  </div></div>
  <p class="muted small center pad">Trip Tracker · your data stays on this phone · student names are never put in calendar files or uploaded</p>
  <p class="muted small center pad" id="screen-info"></p>`;

  function mount(root) {
    // Screen measurements, to diagnose layout problems from a screenshot.
    const si = screenInfo();
    root.querySelector('#screen-info').textContent =
      `Screen ${si.screenW}×${si.screenH} · window ${si.winW}×${si.winH} · ${si.standalone ? 'home screen' : 'browser'} · bar ${Math.round(si.screenH - document.querySelector('.tabbar').getBoundingClientRect().bottom)} from bottom`;
    root.querySelector('#workdays-toggle').addEventListener('change', (e) => {
      store.updateSettings({ workdaysCountAsSchool: e.target.checked });
      toast('Due dates updated');
    });
    root.querySelector('#tag-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = e.target.tag.value.trim();
      if (!v) return;
      if (!store.getSettings().tags.includes(v)) store.updateSettings({ tags: [...store.getSettings().tags, v] });
      rerender();
    });
    root.querySelector('#templates').addEventListener('change', (e) => {
      const el = e.target.closest('[data-key]');
      if (!el) return;
      const { key, field } = el.dataset;
      const overrides = structuredClone(store.getSettings().templateOverrides);
      const o = (overrides[key] ||= {});
      if (field === 'n') {
        const n = Math.max(0, Math.min(365, Math.floor(Number(el.value))));
        if (!Number.isFinite(n)) return;
        o.n = n; el.value = n;
      } else if (field === 'unit') o.unit = el.value;
      else if (field === 'label') {
        const def = DEFAULT_TEMPLATES.find((t) => t.key === key);
        if (!el.value.trim()) el.value = def.label;
        o.label = el.value.trim();
      }
      store.updateSettings({ templateOverrides: overrides });
      toast('Saved. Due dates updated.', { duration: 1800 });
    });
    root.querySelector('#import-file').addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        JSON.parse(text);
        if (!(await confirmSheet('Replace all trips and settings with this backup?', { ok: 'Replace', danger: true }))) return;
        const n = store.importJSON(text);
        toast(`Imported ${n} trip${n === 1 ? '' : 's'}`);
        rerender();
      } catch (err) {
        toast(err instanceof SyntaxError ? 'That file is not valid JSON.' : err.message);
      }
    });
  }

  return {
    title: 'Settings',
    html,
    mount,
    actions: {
      export() {
        const save = async (includeStudents) => {
          const name = `trip-tracker-backup-${today}${includeStudents ? '-with-names' : ''}.json`;
          if (await saveFile(name, 'application/json', store.exportJSON({ includeStudents }))) {
            store.markBackedUp();
            rerender();
          }
        };
        if (!store.hasStudentData()) return save(false);
        // Student names are personal info: only in the file if chosen, every time.
        sheet({
          title: 'Include student names?',
          body: `<div class="stack">
            <p class="muted small">Student names are kept only on this phone. A backup without names still has every trip, task and setting, and restoring it keeps the names already on this phone.</p>
            <button class="btn primary" data-sa="without">Back up without names</button>
            <button class="btn" data-sa="with">Include names</button>
            <p class="muted small">If you include names, save the file only somewhere approved for student information, like "On My iPhone" or your school Google Drive.</p>
            <button class="btn subtle" data-sa="cancel">Cancel</button>
          </div>`,
          actions: { without() { save(false); }, with() { save(true); } },
        });
      },
      import() { document.getElementById('import-file').click(); },
      addDay() { dayForm(); },
      editDay(el) { dayForm(store.getSettings().noSchool.find((d) => d.id === el.dataset.id)); },
      editTag(el) { tagSheet(el.dataset.tag); },
      resetTemplates() {
        const before = store.snapshotSettings();
        store.updateSettings({ templateOverrides: {} });
        rerender();
        toast('Lead times reset to defaults', { duration: 7000, undo: () => { store.restoreSettings(before); rerender(); } });
      },
    },
  };
}

function dayForm(entry) {
  const e = entry || { start: '', end: '', label: '', type: 'closed' };
  sheet({
    title: entry ? 'Edit no-school date' : 'Add no-school date',
    body: `<div class="form">
      <div class="field-row">
        <label class="field"><span>Start</span><input type="date" name="start" value="${esc(e.start)}"></label>
        <label class="field"><span>End (for ranges)</span><input type="date" name="end" value="${esc(e.end !== e.start ? e.end : '')}"></label>
      </div>
      <label class="field"><span>Label</span><input name="label" maxlength="120" value="${esc(e.label)}" placeholder="e.g. Winter break"></label>
      <fieldset class="field"><legend>Type</legend><div class="segmented">
        <label><input type="radio" name="type" value="closed" ${e.type !== 'workday' ? 'checked' : ''}><span>No students</span></label>
        <label><input type="radio" name="type" value="workday" ${e.type === 'workday' ? 'checked' : ''}><span>Student-free workday</span></label>
      </div></fieldset>
      <p class="form-error" role="alert"></p>
      <div class="stack">
        <button class="btn primary" data-sa="save">Save</button>
        ${entry ? '<button class="btn danger subtle" data-sa="remove">Remove</button>' : ''}
        <button class="btn subtle" data-sa="cancel">Cancel</button>
      </div></div>`,
    actions: {
      save(btn, dlg) {
        const start = dlg.querySelector('[name=start]').value;
        let end = dlg.querySelector('[name=end]').value || start;
        if (!isISODate(start)) { dlg.querySelector('.form-error').textContent = 'Pick a start date.'; return false; }
        if (end < start) { dlg.querySelector('.form-error').textContent = 'End must be on or after start.'; return false; }
        const next = {
          id: entry?.id || store.uid(), start, end,
          label: dlg.querySelector('[name=label]').value.trim(),
          type: dlg.querySelector('[name=type]:checked').value,
        };
        const list = store.getSettings().noSchool.filter((d) => d.id !== next.id);
        store.updateSettings({ noSchool: [...list, next] });
        toast('Saved. Due dates updated.');
        rerender();
      },
      remove() {
        const before = store.snapshotSettings();
        store.updateSettings({ noSchool: store.getSettings().noSchool.filter((d) => d.id !== entry.id) });
        rerender();
        toast(`Removed ${entry.label || 'date'}. Due dates updated.`, {
          duration: 7000, undo: () => { store.restoreSettings(before); rerender(); },
        });
      },
    },
  });
}

function tagSheet(tag) {
  const roster = store.getSettings().rosters[tag] || [];
  sheet({
    title: tag,
    body: `<div class="form">
      <label class="field"><span>Rename (updates all trips)</span><input name="name" value="${esc(tag)}" maxlength="80"></label>
      <label class="field"><span>Roster: one student per line (kept on this phone only)</span>
        <textarea name="roster" rows="6" placeholder="Saved names can be added to a trip in one tap">${esc(roster.join('\n'))}</textarea></label>
      <div class="stack">
        <button class="btn primary" data-sa="rename">Save</button>
        <button class="btn danger subtle" data-sa="remove">Remove from list</button>
        <button class="btn subtle" data-sa="cancel">Cancel</button>
      </div>
      <p class="muted small">Removing hides it from the pick list. Trips keep the tag.</p></div>`,
    actions: {
      rename(btn, dlg) {
        const newName = dlg.querySelector('[name=name]').value.trim() || tag;
        store.renameTag(tag, newName);
        store.setTeamRoster(newName, dlg.querySelector('[name=roster]').value);
        rerender();
      },
      remove() {
        const before = store.snapshotSettings();
        store.removeTag(tag);
        rerender();
        toast(`Removed “${tag}”`, { duration: 7000, undo: () => { store.restoreSettings(before); rerender(); } });
      },
    },
  });
}

