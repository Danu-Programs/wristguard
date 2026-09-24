import { getHistory, summarize } from './shared/store.js';

const $ = (id) => document.getElementById(id);
const CIRC = 2 * Math.PI * 52;
const send = (msg) => chrome.runtime.sendMessage(msg);

async function render() {
  const { settings: s, state: st, next, inActiveHours } = await send({ cmd: 'status' });
  const now = Date.now();
  const pill = $('statusPill');
  const paused = st.pausedUntil > now;

  $('pauseRow').classList.toggle('hidden', paused);
  $('btnResume').classList.toggle('hidden', !paused);

  let fraction = 0;
  if (paused) {
    const mins = Math.ceil((st.pausedUntil - now) / 60000);
    pill.className = 'pill'; pill.textContent = 'Paused';
    $('nextMin').textContent = fmt(mins);
    $('nextLabel').textContent = 'until reminders resume';
  } else if (!inActiveHours) {
    pill.className = 'pill'; pill.textContent = 'Off hours';
    $('nextMin').textContent = '--';
    $('nextLabel').textContent = 'outside your active hours';
  } else if (st.pending) {
    pill.className = 'pill warn'; pill.textContent = 'Break due';
    $('nextMin').textContent = 'Now';
    $('nextLabel').textContent = st.pending.type === 'exercise' ? 'exercise break is due' : 'microbreak is due';
    fraction = 1;
  } else if (next) {
    pill.className = 'pill accent'; pill.textContent = 'Active';
    const interval = next.type === 'exercise' ? s.exerciseIntervalMin : s.microIntervalMin;
    $('nextMin').textContent = fmt(Math.max(0, Math.ceil(next.minutes)));
    $('nextLabel').textContent = next.type === 'exercise' ? 'until exercise break' : 'until microbreak';
    fraction = 1 - Math.max(0, next.minutes) / interval;
  } else {
    pill.className = 'pill'; pill.textContent = 'Reminders off';
    $('nextMin').textContent = '--';
    $('nextLabel').textContent = 'enable breaks in settings';
  }
  const ring = $('ringProgress');
  ring.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, Math.max(0, fraction))));
  ring.style.stroke = st.pending ? 'var(--warn)' : 'var(--accent)';
  ring.style.opacity = fraction > 0.005 ? '1' : '0';

  const t = summarize(await getHistory());
  $('sCompleted').textContent = t.completed;
  $('sNatural').textContent = t.natural;
  $('sStreak').textContent = t.streak;
}

function fmt(min) {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

$('btnBreak').addEventListener('click', async () => { await send({ cmd: 'startBreak', type: 'micro' }); window.close(); });
$('btnExercise').addEventListener('click', async () => { await send({ cmd: 'startBreak', type: 'exercise' }); window.close(); });
$('btnResume').addEventListener('click', async () => { await send({ cmd: 'resume' }); render(); });
document.querySelectorAll('[data-pause]').forEach((b) => b.addEventListener('click', async () => {
  await send({ cmd: 'pause', minutes: Number(b.dataset.pause) });
  render();
}));

const openPage = (path) => (e) => { e.preventDefault(); chrome.tabs.create({ url: chrome.runtime.getURL(path) }); window.close(); };
$('lnkChecker').addEventListener('click', openPage('checker/index.html'));
$('lnkDashboard').addEventListener('click', openPage('dashboard.html'));
$('lnkSettings').addEventListener('click', openPage('dashboard.html#settings'));

render();
setInterval(render, 15000);
