/* MathCloud Reading Fluency - admin passage manager.
   Create / edit / upload passages and assign each one to ALL students, a CLASS, or ONE STUDENT.
   Load AFTER admin-management.js and BEFORE admin-auth.js. */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const tokens = s => String(s || '').match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)*/g) || [];
const clean = s => String(s ?? '').replace(/\s+/g, ' ').trim();
const norm = s => clean(s).toLowerCase();
const st = { classes: {}, students: {}, passages: {} };

let db = null;
try { if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG); db = firebase.database(); } catch (e) { console.error(e); }
const P = p => db.ref('readingFluency/' + p);

function toast(t) {
  const x = $('toast'); if (!x) return;
  x.textContent = t; x.classList.remove('hidden');
  clearTimeout(toast.t); toast.t = setTimeout(() => x.classList.add('hidden'), 6000);
}
const msg = (t, cls) => { const m = $('ppMsg'); if (m) { m.textContent = t || ''; m.className = 'mq-msg ' + (cls || ''); } };
const onErr = e => { console.error(e); toast('Database error: ' + (e.message || e)); };

/* ---------- targets: "a:all" | "c:<classId>" | "s:<studentId>" ---------- */
// Returns the assignment fields for a target. Unused fields are null so Firebase removes them on update().
function targetFields(v) {
  const o = { audience: null, classId: null, className: null, studentId: null, studentName: null };
  if (v === 'a:all') { o.audience = 'all'; return o; }
  if (v && v.startsWith('c:')) { const c = st.classes[v.slice(2)]; if (!c) return null; o.classId = v.slice(2); o.className = c.name; return o; }
  if (v && v.startsWith('s:')) { const s = st.students[v.slice(2)]; if (!s) return null; o.studentId = v.slice(2); o.studentName = s.name || ''; return o; }
  return null;
}
function targetValue(p) { return p.audience === 'all' ? 'a:all' : p.classId ? 'c:' + p.classId : p.studentId ? 's:' + p.studentId : ''; }
function targetLabel(p) {
  if (p.audience === 'all') return 'All students';
  if (p.classId) return 'Class: ' + (st.classes[p.classId] ? st.classes[p.classId].name : (p.className || '(deleted class)'));
  if (p.studentId) return 'Student: ' + (st.students[p.studentId] ? st.students[p.studentId].name : (p.studentName || '(removed student)'));
  return 'Not assigned';
}

function options(withBlank, blankLabel, extra) {
  const cs = Object.entries(st.classes).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  const ss = Object.entries(st.students).sort((a, b) => String(a[1].name).localeCompare(String(b[1].name)));
  return (withBlank ? `<option value="">${esc(blankLabel)}</option>` : '') + (extra || '') +
    '<option value="a:all">All students</option>' +
    '<optgroup label="Classes">' + cs.map(([id, c]) => `<option value="c:${esc(id)}">Class: ${esc(c.name)}</option>`).join('') + '</optgroup>' +
    '<optgroup label="Individual students">' + ss.map(([id, s]) => `<option value="s:${esc(id)}">${esc(s.name)} (${esc(s.email || '')})</option>`).join('') + '</optgroup>';
}
function fill() {
  const t = $('ppTarget'), f = $('ppFilter'); if (!t || !f) return;
  const ct = t.value, cf = f.value;
  t.innerHTML = options(true, 'Select who can read this passage');
  f.innerHTML = options(true, 'All passages', '<option value="u:none">Not assigned to anyone</option>').replace('<option value="a:all">', '<option value="a:all">');
  if ([...t.options].some(o => o.value === ct)) t.value = ct;
  if ([...f.options].some(o => o.value === cf)) f.value = cf;
}

/* ---------- table ---------- */
function draw() {
  const body = $('ppTable'); if (!body) return;
  const fv = $('ppFilter').value, q = norm($('ppSearch').value);
  const rows = Object.entries(st.passages)
    .filter(([id, p]) => p && (!fv || (fv === 'u:none' ? !targetValue(p) : targetValue(p) === fv)))
    .filter(([id, p]) => !q || norm((p.title || '') + ' ' + (p.text || '')).includes(q))
    .sort((a, b) => (b[1].updatedAt || b[1].createdAt || 0) - (a[1].updatedAt || a[1].createdAt || 0));
  body.innerHTML = rows.slice(0, 300).map(([id, p]) => {
    const pub = p.status !== 'draft';
    return `<tr><td><b>${esc(p.title)}</b></td><td>${esc(targetLabel(p))}${targetValue(p) ? '' : ' <span class="rf-badge">students cannot see it</span>'}</td><td>${esc(p.level || '—')}</td><td>${tokens(p.text).length}</td><td>${pub ? 'Published' : 'Draft'}</td>` +
      `<td><button class="btn" data-pp-edit="${esc(id)}">Edit</button> <button class="btn" data-pp-toggle="${esc(id)}">${pub ? 'Unpublish' : 'Publish'}</button> <button class="btn danger" data-pp-del="${esc(id)}">Delete</button></td></tr>`;
  }).join('') || '<tr><td colspan="6" class="mq-muted">No passages found.</td></tr>';
  const c = $('passageCountAdmin'); if (c) c.textContent = Object.keys(st.passages).length;
}

/* ---------- create / edit ---------- */
function resetForm() { $('ppForm').reset(); $('ppId').value = ''; $('ppSave').textContent = 'Save passage'; msg(''); }

$('ppForm')?.addEventListener('submit', async e => {
  e.preventDefault(); msg('');
  const title = clean($('ppTitle').value), text = clean($('ppText').value), tf = targetFields($('ppTarget').value);
  if (!tf) return msg('Choose who this passage is for.', 'bad');
  if (!title || tokens(text).length < 3) return msg('Enter a title and a passage of at least 3 words.', 'bad');
  const id = $('ppId').value, editing = !!id, btn = $('ppSave'); btn.disabled = true;
  try {
    const key = id || P('passages').push().key, old = (st.passages[key]) || {};
    await P('passages/' + key).update({
      title, level: clean($('ppLevel').value), text,
      targetWpm: Number($('ppWpm').value) || null,
      status: $('ppStatus').value === 'draft' ? 'draft' : 'published',
      active: true, createdAt: old.createdAt || Date.now(), updatedAt: Date.now(), ...tf
    });
    resetForm(); toast(editing ? 'Passage updated. Students see the change straight away.' : 'Passage saved and assigned.');
  } catch (x) { console.error(x); msg(x.code === 'PERMISSION_DENIED' ? 'Firebase rules blocked the save. Publish the updated database.rules.json.' : (x.message || 'Could not save.'), 'bad'); }
  finally { btn.disabled = false; }
});
$('ppCancel')?.addEventListener('click', resetForm);
$('ppFilter')?.addEventListener('change', draw);
$('ppSearch')?.addEventListener('input', draw);

$('ppTable')?.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  try {
    if (b.dataset.ppEdit) {
      const id = b.dataset.ppEdit, p = st.passages[id]; if (!p) return;
      $('ppId').value = id; $('ppTitle').value = p.title || ''; $('ppLevel').value = p.level || ''; $('ppWpm').value = p.targetWpm || '';
      $('ppText').value = p.text || ''; $('ppStatus').value = p.status === 'draft' ? 'draft' : 'published';
      const tv = targetValue(p); $('ppTarget').value = [...$('ppTarget').options].some(o => o.value === tv) ? tv : '';
      $('ppSave').textContent = 'Update passage'; msg('Editing “' + (p.title || '') + '”. Press Update passage to save.', 'wait');
      $('ppForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (b.dataset.ppToggle) {
      const id = b.dataset.ppToggle, p = st.passages[id]; if (!p) return;
      await P('passages/' + id).update({ status: p.status === 'draft' ? 'published' : 'draft', updatedAt: Date.now() });
      toast(p.status === 'draft' ? 'Passage published.' : 'Passage hidden from students.');
    }
    if (b.dataset.ppDel) {
      const id = b.dataset.ppDel, p = st.passages[id]; if (!p) return;
      if (!confirm('Delete “' + (p.title || 'this passage') + '”? Past session reports are kept.')) return;
      await P('passages/' + id).remove(); toast('Passage deleted.');
    }
  } catch (x) { onErr(x); }
});

/* ---------- Excel ---------- */
const SAMPLE = [
  ['The Helpful Neighbour', 'Primary 4', 'One bright morning, Amina walked to school with her books. She noticed an elderly neighbour carrying a heavy basket. Amina offered to help, and they walked together to the gate. The neighbour thanked her for being thoughtful and kind.', 90, 'published'],
  ['A Rainy Afternoon', 'Primary 5', 'Dark clouds gathered above the town. Soon, gentle rain tapped against the windows and washed the dusty road. Children listened to the rhythm of the rain while their teacher explained how water helps plants grow.', 105, 'published']
];
$('ppTpl')?.addEventListener('click', () => {
  if (!window.XLSX) return toast('Excel library failed to load. Check your internet connection.');
  const tv = $('ppTarget').value, tf = targetFields(tv);
  const label = !tf ? 'ALL' : tf.audience ? 'ALL' : tf.className || (st.students[tv.slice(2)] || {}).email || 'ALL';
  const rows = [['title', 'level', 'text', 'targetWpm', 'status', 'assignTo'], ...SAMPLE.map(r => [...r, label])];
  const ws = XLSX.utils.aoa_to_sheet(rows); ws['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 100 }, { wch: 11 }, { wch: 11 }, { wch: 26 }];
  const ref = [['Valid assignTo values (copy exactly)'], ['ALL'], ...Object.values(st.classes).map(c => [c.name]), ...Object.values(st.students).map(s => [s.email || s.name])];
  const wr = XLSX.utils.aoa_to_sheet(ref); wr['!cols'] = [{ wch: 44 }];
  const ins = XLSX.utils.aoa_to_sheet([
    ['READING FLUENCY PASSAGES'], ['One passage per row on the Passages sheet. Keep the header names unchanged.'],
    ['title, text', 'Required.'], ['assignTo', 'ALL, a class name, or a student email. Blank = use the Assign-to choice on the admin page.'],
    ['status', 'published or draft.'], ['targetWpm', 'Optional target words per minute.']]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Passages'); XLSX.utils.book_append_sheet(wb, wr, 'Assign-to values'); XLSX.utils.book_append_sheet(wb, ins, 'Instructions');
  XLSX.writeFile(wb, 'reading-fluency-passages-template.xlsx');
});

function resolveAssign(a) {
  const k = norm(a); if (!k) return { fallback: true };
  if (['all', 'all students', 'everyone', '*'].includes(k)) return { f: targetFields('a:all') };
  for (const [id, c] of Object.entries(st.classes)) if (norm(c.name) === k) return { f: targetFields('c:' + id) };
  for (const [id, s] of Object.entries(st.students)) if (norm(s.email) === k) return { f: targetFields('s:' + id) };
  const byName = Object.entries(st.students).filter(([, s]) => norm(s.name) === k);
  if (byName.length === 1) return { f: targetFields('s:' + byName[0][0]) };
  return { bad: byName.length > 1 ? 'more than one student has that name; use their email' : 'does not match any class, student email or ALL' };
}
const keyOf = f => f.audience ? 'a:all' : f.classId ? 'c:' + f.classId : 's:' + f.studentId;

$('ppFile')?.addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return; msg('');
  if (!window.XLSX) return msg('Excel library failed to load.', 'bad');
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const name = wb.SheetNames.find(n => norm(n) === 'passages') || wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '' });
    if (!rows.length) throw Error('No data rows found on the "' + name + '" sheet.');
    const selected = targetFields($('ppTarget').value);
    const have = new Set(Object.values(st.passages).map(p => norm(p.title) + '|' + targetValue(p)));
    const up = {}, errs = []; let added = 0, dups = 0, n = 0;
    rows.forEach((r, i) => {
      const L = {}; Object.entries(r).forEach(([k, v]) => { L[String(k).toLowerCase().replace(/[^a-z]/g, '')] = v; });
      const title = clean(L.title || L.passagetitle || L.name), text = clean(L.text || L.passage || L.passagetext);
      if (!title && !text) return;                       // blank / formula-only rows are ignored
      const line = 'Row ' + (i + 2) + ' (' + (title || 'no title') + '): ';
      if (!title || !text) return errs.push(line + 'title and text are both required.');
      if (tokens(text).length < 3) return errs.push(line + 'passage needs at least 3 words.');
      const a = resolveAssign(L.assignto || L.assignedto || L.assign);
      let tf = a.f; if (a.fallback) tf = selected;
      if (a.bad) return errs.push(line + 'assignTo ' + a.bad + '.');
      if (!tf) return errs.push(line + 'assignTo is blank and no "Assign to" choice is selected above.');
      const k = norm(title) + '|' + keyOf(tf);
      if (have.has(k)) { dups++; return; }
      have.add(k);
      up[P('passages').push().key] = {
        title, level: clean(L.level), text, targetWpm: Number(L.targetwpm || L.wpm) || null,
        status: /^draft$/i.test(String(L.status).trim()) ? 'draft' : 'published', active: true,
        createdAt: Date.now() + (n++), updatedAt: Date.now(), ...Object.fromEntries(Object.entries(tf).filter(([, v]) => v !== null))
      };
      added++;
    });
    if (added) await P('passages').update(up);
    const summary = `Imported ${added} passage${added === 1 ? '' : 's'}. Skipped ${dups} duplicate${dups === 1 ? '' : 's'} and ${errs.length} row${errs.length === 1 ? '' : 's'} with problems.`;
    msg(summary + (errs.length ? '\n' + errs.slice(0, 15).join('\n') + (errs.length > 15 ? '\n…and ' + (errs.length - 15) + ' more.' : '') : ''), errs.length && !added ? 'bad' : 'good');
    toast(summary);
  } catch (x) { console.error(x); msg('Import failed: ' + (x.message || x), 'bad'); }
});

/* ---------- start with the other admin listeners (after admin sign-in) ---------- */
const prev = window.rfStartAdminListeners;
window.rfStartAdminListeners = function () {
  if (prev) prev();
  if (!db || window.__ppStarted) return; window.__ppStarted = true;
  P('classes').on('value', s => { st.classes = s.val() || {}; fill(); draw(); }, onErr);
  P('students').on('value', s => { st.students = s.val() || {}; fill(); draw(); }, onErr);
  P('passages').on('value', s => { st.passages = s.val() || {}; draw(); }, onErr);
};
})();
