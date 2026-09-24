import { getSettings, saveSettings, getHistory, clearHistory, summarize, lastNDays } from './shared/store.js';
import { EXERCISES, EXERCISE_BY_ID, totalSeconds, formatDuration } from './shared/exercises.js';

const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);
const VIEWS = ['today', 'exercises', 'posture', 'learn', 'history', 'settings'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- routing ----------
function route() {
  let view = location.hash.slice(1) || 'today';
  if (view === 'welcome') { $('welcome').classList.remove('hidden'); view = 'today'; }
  if (!VIEWS.includes(view)) view = 'today';
  for (const v of VIEWS) $(`view-${v}`).classList.toggle('active', v === view);
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${view}`));
  if (view === 'today') renderToday();
  if (view === 'history') renderHistory();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

// ---------- today ----------
async function renderToday() {
  $('todayDate').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const { settings: s, state: st } = await send({ cmd: 'status' });
  const paused = st.pausedUntil > Date.now();

  const setTimer = (enabled, done, interval, bar, left, sub) => {
    if (!enabled) { $(bar).style.width = '0'; $(left).textContent = 'off'; $(sub).textContent = 'disabled'; return; }
    const frac = Math.min(1, done / interval);
    $(bar).style.width = `${frac * 100}%`;
    $(left).textContent = paused ? 'paused' : `${Math.max(0, Math.ceil(interval - done))}m`;
    $(sub).textContent = `every ${interval} active min`;
  };
  setTimer(s.microEnabled, st.activeSinceMicro, s.microIntervalMin, 'microBar', 'microLeft', 'microSub');
  setTimer(s.exerciseEnabled, st.activeSinceExercise, s.exerciseIntervalMin, 'exBar', 'exLeft', 'exSub');

  const history = await getHistory();
  const t = summarize(history);
  $('tCompleted').textContent = t.completed;
  $('tSkipped').textContent = t.skipped;
  $('tNatural').textContent = t.natural;
  $('tFollow').textContent = t.followRate === null ? '--' : `${t.followRate}%`;
  $('streakLine').textContent = t.streak
    ? `${t.streak}-day streak of taking at least one break.`
    : 'Take one break today to start a streak.';

  // 7-day chart
  const days = lastNDays(history, 7);
  const max = Math.max(4, ...days.map((d) => d.completed + d.skipped));
  $('weekChart').innerHTML = days.map((d, i) => `
    <div class="col ${i === days.length - 1 ? 'today' : ''}" title="${d.completed} taken, ${d.skipped} skipped">
      <span class="val">${d.completed}</span>
      <div class="bars">
        <div class="b ok" style="height:${(d.completed / max) * 100}%"></div>
        <div class="b skip" style="height:${(d.skipped / max) * 100}%"></div>
      </div>
      <span class="day">${esc(d.label)}</span>
    </div>`).join('');

  // latest posture session
  const posture = history.filter((e) => e.kind === 'posture').pop();
  if (posture) {
    const when = new Date(posture.ts).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    $('postureSummary').innerHTML = `
      <p>${esc(when)} &middot; ${Math.round(posture.seconds / 60)} min &middot; ${posture.view === 'side' ? 'side view' : 'top view'}</p>
      <div class="posture-grid">
        <div class="stat"><span class="num">${posture.pctOk}%</span><span class="lbl">in OK zone</span></div>
        <div class="stat"><span class="num">${posture.pctCaution}%</span><span class="lbl">caution</span></div>
        <div class="stat"><span class="num">${posture.pctRisk}%</span><span class="lbl">high</span></div>
        <div class="stat"><span class="num">${posture.worst ?? '--'}&deg;</span><span class="lbl">peak angle</span></div>
      </div>
      <div class="zbar"><div class="ok" style="width:${posture.pctOk}%"></div><div class="warn" style="width:${posture.pctCaution}%"></div><div class="risk" style="width:${posture.pctRisk}%"></div></div>`;
  }
}

$('dMicro').addEventListener('click', () => send({ cmd: 'startBreak', type: 'micro' }));
$('dExercise').addEventListener('click', () => send({ cmd: 'startBreak', type: 'exercise' }));
$('dReset').addEventListener('click', async () => { await send({ cmd: 'resetTimers' }); renderToday(); });
$('dismissWelcome').addEventListener('click', () => { $('welcome').classList.add('hidden'); history.replaceState(null, '', '#today'); });

// ---------- exercises ----------
function renderExercises() {
  $('exerciseList').innerHTML = EXERCISES.map((ex) => `
    <article class="card ex-card">
      <div class="meta">
        <span class="pill accent">${esc(ex.area)}</span>
        <span class="pill">${formatDuration(totalSeconds(ex.steps))}</span>
        ${ex.caution ? '<span class="pill warn">Go gently</span>' : ''}
      </div>
      <h2>${esc(ex.name)}</h2>
      <p>${esc(ex.summary)}</p>
      <p class="evidence">${esc(ex.evidence)}</p>
      <details>
        <summary>Steps</summary>
        <ol>${uniqueSteps(ex.steps).map((st) => `<li><strong>${esc(st.title.replace(/ \(round.*\)$/, ''))}:</strong> ${esc(st.text)} <small>(${st.sec}s)</small></li>`).join('')}</ol>
      </details>
      <button class="btn" data-try="${ex.id}">Try it now</button>
    </article>`).join('');
  document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => send({ cmd: 'tryExercise', id: b.dataset.try })));
}

function uniqueSteps(steps) {
  const seen = new Set();
  return steps.filter((st) => {
    const k = st.title.replace(/ \(round.*\)$/, '') + st.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- posture ----------
$('openChecker').addEventListener('click', () => chrome.tabs.create({ url: chrome.runtime.getURL('checker/index.html') }));

// ---------- history ----------
const KIND = { micro: 'Microbreak', exercise: 'Exercise break', natural: 'Natural rest', posture: 'Posture check' };
const OUTCOME = { completed: ['ok', 'Completed'], skipped: ['risk', 'Skipped'], snoozed: ['warn', 'Snoozed'], natural: ['accent', 'Away'], measured: ['accent', 'Measured'] };

function detail(e) {
  if (e.kind === 'natural') return `${e.minutes} min away`;
  if (e.kind === 'posture') return `${e.pctOk}% OK, ${e.pctRisk}% high, ${Math.round(e.seconds / 60)} min`;
  if (e.seconds) return formatDuration(e.seconds);
  return '';
}

async function renderHistory() {
  const rows = (await getHistory()).slice().reverse().slice(0, 300);
  $('historyEmpty').classList.toggle('hidden', rows.length > 0);
  document.querySelector('#historyTable tbody').innerHTML = rows.map((e) => {
    const [cls, label] = OUTCOME[e.outcome] || ['', e.outcome];
    return `<tr>
      <td>${esc(new Date(e.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td>
      <td>${esc(KIND[e.kind] || e.kind)}</td>
      <td><span class="pill ${cls}">${esc(label)}</span></td>
      <td class="muted">${esc(detail(e))}</td>
    </tr>`;
  }).join('');
}

$('exportCsv').addEventListener('click', async () => {
  const rows = await getHistory();
  const cols = ['timestamp', 'kind', 'outcome', 'seconds', 'minutes', 'view', 'pctOk', 'pctCaution', 'pctRisk', 'worst'];
  const csv = [cols.join(',')].concat(rows.map((e) => [new Date(e.ts).toISOString(), ...cols.slice(1).map((c) => e[c] ?? '')].join(','))).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `wristguard-history-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
});

$('clearHistory').addEventListener('click', async () => {
  if (!confirm('Delete all WristGuard history on this computer?')) return;
  await clearHistory();
  renderHistory();
});

// ---------- settings ----------
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
let saveTimer;

async function renderSettings() {
  const s = await getSettings();
  const form = $('settingsForm');
  for (const el of form.elements) {
    if (!el.name || !(el.name in s)) continue;
    if (el.type === 'checkbox') el.checked = !!s[el.name];
    else el.value = s[el.name];
  }
  $('routinePicker').innerHTML = EXERCISES.map((ex) => `
    <label><input type="checkbox" data-routine="${ex.id}" ${s.routine.includes(ex.id) ? 'checked' : ''}>
    ${esc(ex.name)}<small class="muted">${formatDuration(totalSeconds(ex.steps))}</small></label>`).join('');
  $('dayPicker').innerHTML = DAY_NAMES.map((d, i) => `
    <label><input type="checkbox" data-day="${i}" ${s.activeDays.includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('');
  updateRoutineLen(s.routine);
}

function updateRoutineLen(routine) {
  const sec = routine.reduce((a, id) => a + (EXERCISE_BY_ID[id] ? totalSeconds(EXERCISE_BY_ID[id].steps) : 0), 0);
  $('routineLen').textContent = `${formatDuration(sec)} total`;
}

function readForm() {
  const form = $('settingsForm');
  const patch = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') patch[el.name] = el.checked;
    else if (el.type === 'number') {
      const n = Number(el.value);
      if (!Number.isFinite(n) || el.value === '') continue;
      patch[el.name] = Math.min(Number(el.max), Math.max(Number(el.min), n));
    } else patch[el.name] = el.value;
  }
  // keep routine in library order
  patch.routine = EXERCISES.map((e) => e.id).filter((id) => document.querySelector(`[data-routine="${id}"]`)?.checked);
  patch.activeDays = [...document.querySelectorAll('[data-day]')].filter((c) => c.checked).map((c) => Number(c.dataset.day));
  return patch;
}

$('settingsForm').addEventListener('input', () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const patch = readForm();
    await saveSettings(patch);
    await send({ cmd: 'settingsChanged' });
    updateRoutineLen(patch.routine);
    $('savedNote').textContent = 'Saved';
    setTimeout(() => ($('savedNote').textContent = ''), 1500);
  }, 300);
});
$('settingsForm').addEventListener('submit', (e) => e.preventDefault());

// ---------- boot ----------
renderExercises();
renderSettings();
route();
setInterval(() => { if (location.hash === '' || location.hash === '#today') renderToday(); }, 20000);
chrome.storage.onChanged.addListener((changes) => {
  if (changes.history && location.hash === '#history') renderHistory();
});
