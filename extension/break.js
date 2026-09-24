import { getSettings } from './shared/store.js';
import { MICRO_STEPS } from './shared/config.js';
import { EXERCISE_BY_ID, totalSeconds, formatDuration } from './shared/exercises.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const type = params.get('type') || 'micro'; // micro | exercise | single
const RING = 2 * Math.PI * 88;
const send = (msg) => chrome.runtime.sendMessage(msg);

let settings;
let steps = [];
let idx = 0;
let stepLeft = 0;        // ms remaining in current step
let running = false;
let lastFrame = 0;
let elapsedMs = 0;
let timer = null;

function buildSteps(s) {
  if (type === 'micro') {
    const total = s.microDurationSec;
    const w = MICRO_STEPS.reduce((a, st) => a + st.weight, 0);
    let used = 0;
    return MICRO_STEPS.map((st, i) => {
      const sec = i === MICRO_STEPS.length - 1 ? total - used : Math.round((total * st.weight) / w);
      used += sec;
      return { group: 'Microbreak', title: st.title, text: st.text, sec };
    });
  }
  const ids = type === 'single' ? [params.get('id')] : s.routine;
  return ids
    .map((id) => EXERCISE_BY_ID[id])
    .filter(Boolean)
    .flatMap((ex) => ex.steps.map((st) => ({ ...st, group: ex.name, caution: !!ex.caution })));
}

function groupsOf(list) {
  const out = [];
  for (const st of list) {
    const last = out[out.length - 1];
    if (last && last.name === st.group) last.sec += st.sec;
    else out.push({ name: st.group, sec: st.sec });
  }
  return out;
}

async function init() {
  settings = await getSettings();
  steps = buildSteps(settings);
  const total = totalSeconds(steps);

  $('kind').textContent = type === 'micro' ? 'Microbreak' : type === 'exercise' ? 'Exercise break' : 'Practice';
  $('btnSnooze').textContent = `Snooze ${settings.snoozeMin} min`;

  if (type === 'micro') {
    $('introTitle').textContent = 'Time to rest your hands';
    $('introText').textContent = `A ${formatDuration(total)} pause. Short, frequent breaks reduced wrist, neck and shoulder discomfort in office studies without slowing work down.`;
  } else if (type === 'exercise') {
    $('introTitle').textContent = 'Wrist exercise break';
    $('introText').textContent = `A guided ${formatDuration(total)} routine. Move slowly and keep every stretch mild.`;
  } else {
    const ex = EXERCISE_BY_ID[params.get('id')];
    $('introTitle').textContent = ex ? ex.name : 'Exercise';
    $('introText').textContent = ex ? ex.summary : '';
    $('btnSnooze').parentElement.classList.add('hidden');
  }
  if (!steps.length) {
    $('introText').textContent = 'Your routine is empty. Pick exercises in Settings.';
    $('btnStart').disabled = true;
  }
  $('introList').innerHTML = groupsOf(steps)
    .map((g) => `<li>${escapeHtml(g.name)}<span>${formatDuration(g.sec)}</span></li>`)
    .join('');
  if (type === 'micro') $('introList').classList.add('hidden');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- sound ----------
let audio;
function tone(freq, dur = 0.18, gain = 0.06) {
  if (!settings.sound) return;
  try {
    audio = audio || new AudioContext();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(gain, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + dur);
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + dur);
  } catch { /* audio unavailable */ }
}

// ---------- runner ----------
function show(panel) {
  for (const id of ['intro', 'run', 'done']) $(id).classList.toggle('hidden', id !== panel);
}

function loadStep(i) {
  idx = i;
  const st = steps[i];
  stepLeft = st.sec * 1000;
  $('exName').textContent = st.group;
  $('stepTitle').textContent = st.title;
  $('stepText').textContent = st.text;
  $('caution').classList.toggle('hidden', !st.caution);
  $('stepCount').textContent = `step ${i + 1} of ${steps.length}`;
  const nxt = steps[i + 1];
  $('nextUp').textContent = nxt ? `Next: ${nxt.group === st.group ? nxt.title : nxt.group}` : 'Last step';
  paint();
}

function paint() {
  const st = steps[idx];
  const frac = stepLeft / (st.sec * 1000);
  $('secs').textContent = Math.ceil(stepLeft / 1000);
  $('ring').style.strokeDashoffset = String(RING * (1 - frac));
  const total = totalSeconds(steps) * 1000;
  $('overall').style.width = `${Math.min(100, (elapsedMs / total) * 100)}%`;
}

function frame() {
  const now = performance.now();
  const dt = now - lastFrame;
  lastFrame = now;
  if (!running) return;
  stepLeft -= dt;
  elapsedMs += dt;
  if (stepLeft <= 0) {
    if (idx + 1 < steps.length) { tone(660); loadStep(idx + 1); }
    else return complete();
  }
  paint();
}

function start() {
  show('run');
  loadStep(0);
  running = true;
  lastFrame = performance.now();
  tone(520);
  timer = setInterval(frame, 200);
}

async function complete() {
  running = false;
  clearInterval(timer);
  tone(784, 0.35);
  setTimeout(() => tone(1046, 0.4), 180);
  await send({ cmd: 'breakDone', type, seconds: Math.round(elapsedMs / 1000) });
  show('done');
  if (type === 'single') $('doneText').textContent = 'Exercise complete.';
  let n = 10;
  const tickClose = () => {
    $('autoClose').textContent = `Closing in ${n}s`;
    if (n-- <= 0) window.close();
  };
  tickClose();
  const closer = setInterval(tickClose, 1000);
  document.addEventListener('pointerdown', () => { clearInterval(closer); $('autoClose').textContent = ''; }, { once: true });
}

$('btnStart').addEventListener('click', start);
$('btnSnooze').addEventListener('click', async () => { await send({ cmd: 'breakSnoozed', type }); window.close(); });
$('btnSkip').addEventListener('click', async () => {
  if (type !== 'single') await send({ cmd: 'breakSkipped', type });
  window.close();
});
$('btnPause').addEventListener('click', () => {
  running = !running;
  lastFrame = performance.now();
  $('btnPause').textContent = running ? 'Pause' : 'Resume';
});
$('btnNext').addEventListener('click', () => {
  elapsedMs += Math.max(0, stepLeft);
  if (idx + 1 < steps.length) loadStep(idx + 1);
  else complete();
});
$('btnEnd').addEventListener('click', async () => {
  const total = totalSeconds(steps) * 1000;
  if (elapsedMs >= total * 0.5) return complete();
  running = false;
  if (type !== 'single') await send({ cmd: 'breakSkipped', type });
  window.close();
});
$('btnClose').addEventListener('click', () => window.close());
$('btnPosture').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('checker/index.html') });
  window.close();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !$('intro').classList.contains('hidden') && !$('btnStart').disabled) start();
  if (e.key === ' ' && !$('run').classList.contains('hidden')) { e.preventDefault(); $('btnPause').click(); }
});

init();
