// WristGuard posture checker.
// Runs MediaPipe Holistic fully on-device (bundled model + WebAssembly), pairs each hand with
// its elbow, computes the wrist angle for the chosen camera view, and scores it against
// carpal tunnel pressure thresholds (Keir et al., 2007).
import { signedWristAngle, classify, pairHandsWithElbows, ema } from './angles.js';
import { THRESHOLDS } from '../shared/config.js';
import { getSettings, saveSettings, logEvent } from '../shared/store.js';

const $ = (id) => document.getElementById(id);
const video = $('video');
const canvas = $('overlay');
const ctx = canvas.getContext('2d');
const isExtension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

const RANGE = { side: [-60, 60], top: [-35, 35] };
const COLORS = { ok: '#22c55e', caution: '#f59e0b', risk: '#ef4444' };
const VIEW_HELP = {
  side: 'Camera level with the desk, off to one side. It should see your elbow, forearm and hand. Measures bending up (extension) and down (flexion).',
  top: 'Camera looking down at the keyboard, forearms in frame. Measures bending toward the pinky (ulnar) or thumb (radial).'
};

let settings;
let view = 'side';
let holistic = null;
let stream = null;
let running = false;
let busy = false;
let calibration = { side: {}, top: {} };
let calibrating = null;         // { t0, samples: { left: [], right: [] } }
let smooth = { left: null, right: null };
let lastSeen = { left: 0, right: 0 };
let session = null;             // { start, tracked, ok, caution, risk, worst }
let lastFrameTs = 0;
let riskSince = 0;
let lastAlert = 0;

// ---------- setup ----------
async function init() {
  settings = await getSettings();
  calibration = { side: {}, top: {}, ...(settings.calibration || {}) };
  if (isExtension) $('backLink').classList.remove('hidden');
  setView(settings.checkerView || 'side');
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('btnStart').addEventListener('click', start);
  $('btnStop').addEventListener('click', stop);
  $('btnCalibrate').addEventListener('click', calibrate);
  window.addEventListener('pagehide', () => { if (running) finishSession(); });
}

function setView(v) {
  if (session && session.tracked > 0 && v !== view) finishSession(true);
  view = v;
  document.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === v)));
  $('viewHelp').textContent = VIEW_HELP[v];
  smooth = { left: null, right: null };
  buildGauges();
  updateCalibPill();
  saveSettings({ checkerView: v });
}

function buildGauges() {
  const [min, max] = RANGE[view];
  const neg = view === 'side' ? THRESHOLDS.flexion : THRESHOLDS.radial;
  const pos = view === 'side' ? THRESHOLDS.extension : THRESHOLDS.ulnar;
  const segs = [
    ['risk', min, -neg.risk], ['warn', -neg.risk, -neg.caution], ['ok', -neg.caution, pos.caution],
    ['warn', pos.caution, pos.risk], ['risk', pos.risk, max]
  ];
  const span = max - min;
  const html = segs.map(([c, a, b]) => `<div class="${c}" style="width:${((b - a) / span) * 100}%"></div>`).join('');
  const labels = view === 'side'
    ? [`Flexion ${-min}&deg;`, '0&deg;', `Extension ${max}&deg;`]
    : [`Radial ${-min}&deg;`, '0&deg;', `Ulnar ${max}&deg;`];
  document.querySelectorAll('.hand').forEach((h) => {
    h.querySelector('[data-el=zones]').innerHTML = html;
    h.querySelector('[data-el=scale]').innerHTML = labels.map((l) => `<span>${l}</span>`).join('');
  });
}

function updateCalibPill() {
  const c = calibration[view] || {};
  const done = c.left !== undefined || c.right !== undefined;
  const pill = $('calibPill');
  pill.className = done ? 'pill ok' : 'pill warn';
  pill.textContent = done ? 'Calibrated' : 'Not calibrated';
}

function stageMessage(html) {
  if (!html) { $('stageMsg').classList.add('hidden'); return; }
  $('stageMsg').classList.remove('hidden');
  $('stageMsg').innerHTML = `<div class="stage-msg-inner">${html}</div>`;
}

// ---------- camera + model ----------
async function start() {
  stageMessage('<div class="spinner"></div><h2>Loading the tracking model</h2><p>First load takes a few seconds. Everything runs on this device.</p>');
  try {
    if (!holistic) {
      if (typeof window.Holistic !== 'function') throw new Error('Tracking library failed to load.');
      holistic = new window.Holistic({ locateFile: (f) => `vendor/holistic/${f}` });
      holistic.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });
      holistic.onResults(onResults);
      await holistic.initialize();
    }
    stageMessage('<div class="spinner"></div><h2>Starting camera</h2><p>Allow camera access when your browser asks.</p>');
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    await video.play();
  } catch (err) {
    const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
    stageMessage(`<h2>${denied ? 'Camera access was blocked' : 'Could not start'}</h2>
      <p>${denied ? 'Allow camera access for this page in your browser settings, then try again.' : escapeHtml(err?.message || String(err))}</p>
      <button class="btn primary" id="btnRetry">Try again</button>`);
    $('btnRetry').addEventListener('click', start);
    return;
  }
  stageMessage(null);
  running = true;
  session = { start: performance.now(), tracked: 0, ok: 0, caution: 0, risk: 0, worst: 0 };
  lastFrameTs = performance.now();
  $('btnCalibrate').disabled = false;
  $('btnStop').disabled = false;
  if (!(calibration[view].left !== undefined || calibration[view].right !== undefined)) {
    $('tip').textContent = 'Hold your wrists straight, in line with your forearms, and press Calibrate.';
  }
  loop();
}

// ~15 fps is plenty for posture coaching and keeps CPU and battery use low while you type.
// Always yield at least 30 ms so the page stays responsive on slower machines.
const FRAME_MS = 66;
async function loop() {
  if (!running) return;
  const t0 = performance.now();
  if (!busy && video.readyState >= 2) {
    busy = true;
    try { await holistic.send({ image: video }); } catch (e) { console.error(e); }
    busy = false;
  }
  setTimeout(loop, Math.max(30, FRAME_MS - (performance.now() - t0)));
}

function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $('btnCalibrate').disabled = true;
  $('btnStop').disabled = true;
  $('alert').classList.add('hidden');
  const saved = finishSession();
  stageMessage(`<h2>Session ${saved ? 'saved' : 'ended'}</h2>
    <p>${saved ? `You spent ${saved.pctOk}% of tracked time in the OK zone.` : 'Not enough tracked time to save. Sessions with at least 20 seconds of wrist tracking are logged.'}</p>
    <button class="btn primary" id="btnAgain">Start again</button>`);
  $('btnAgain').addEventListener('click', start);
}

function finishSession(restart = false) {
  const s = session;
  if (!s) return null;
  session = restart ? { start: performance.now(), tracked: 0, ok: 0, caution: 0, risk: 0, worst: 0 } : null;
  if (s.tracked < 20) return null;
  const pct = (x) => Math.round((x / s.tracked) * 100);
  const summary = {
    kind: 'posture', outcome: 'measured', view,
    seconds: Math.round(s.tracked), pctOk: pct(s.ok), pctCaution: pct(s.caution), pctRisk: pct(s.risk),
    worst: Math.round(s.worst)
  };
  summary.pctCaution = Math.max(0, 100 - summary.pctOk - summary.pctRisk);
  logEvent(summary);
  return summary;
}

// ---------- calibration ----------
// Collect for at least 3 s and at least 5 tracked frames, up to 10 s on slow machines.
const CAL_MIN_MS = 3000;
const CAL_MAX_MS = 10000;
const CAL_MIN_SAMPLES = 5;

function calibrate() {
  const t0 = performance.now();
  calibrating = { t0, samples: { left: [], right: [] } };
  $('btnCalibrate').disabled = true;
  const el = $('countdown');
  el.classList.remove('hidden');
  const tick = () => {
    if (!calibrating) return;
    const elapsed = performance.now() - t0;
    const enough = Math.max(calibrating.samples.left.length, calibrating.samples.right.length) >= CAL_MIN_SAMPLES;
    if ((elapsed >= CAL_MIN_MS && enough) || elapsed >= CAL_MAX_MS) return finishCalibration();
    const left = Math.ceil((CAL_MIN_MS - elapsed) / 1000);
    el.innerHTML = left > 0 ? `<div>${left}<small>Hold wrists straight</small></div>` : '<div><small>Still measuring, keep holding</small></div>';
    setTimeout(tick, 100);
  };
  tick();
}

function finishCalibration() {
  const { samples } = calibrating;
  calibrating = null;
  $('countdown').classList.add('hidden');
  $('btnCalibrate').disabled = !running;
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  let got = 0;
  for (const side of ['left', 'right']) {
    if (samples[side].length >= 3) { calibration[view][side] = median(samples[side]); got++; }
  }
  if (!got) {
    $('tip').textContent = 'Calibration failed: no wrist was tracked. Make sure your elbow and hand are both in frame, then try again.';
    return;
  }
  smooth = { left: null, right: null };
  saveSettings({ calibration });
  updateCalibPill();
  $('tip').textContent = 'Calibrated. Now type normally and watch the readings.';
}

// ---------- per-frame ----------
function onResults(results) {
  if (!running) return;
  const now = performance.now();
  const dt = Math.min(2, (now - lastFrameTs) / 1000); // cap so a stalled tab does not count as tracked time
  lastFrameTs = now;

  const w = results.image.width;
  const h = results.image.height;
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  ctx.clearRect(0, 0, w, h);
  const aspect = w / h;

  const pairs = pairHandsWithElbows(results.poseLandmarks, [results.leftHandLandmarks, results.rightHandLandmarks]);
  const readings = {};
  for (const p of pairs) {
    const raw = signedWristAngle({ elbow: p.elbow, hand: p.hand, view, aspect });
    if (raw === null) continue;
    if (calibrating) calibrating.samples[p.side].push(raw);
    const base = calibration[view][p.side] ?? 0;
    smooth[p.side] = ema(smooth[p.side], raw - base);
    lastSeen[p.side] = now;
    readings[p.side] = classify(smooth[p.side], view);
    readings[p.side].angle = smooth[p.side];
    draw(p, readings[p.side].zone, w, h);
  }

  for (const side of ['left', 'right']) {
    if (!readings[side] && now - lastSeen[side] > 600) smooth[side] = null;
    renderHand(side, readings[side]);
  }

  // Session accounting uses the worse of the two wrists.
  const zones = Object.values(readings).map((r) => r.zone);
  if (zones.length && session && !calibrating) {
    const worst = zones.includes('risk') ? 'risk' : zones.includes('caution') ? 'caution' : 'ok';
    session.tracked += dt;
    session[worst] += dt;
    session.worst = Math.max(session.worst, ...Object.values(readings).map((r) => r.mag));
    handleAlert(worst, now);
  } else {
    handleAlert('ok', now);
  }
  renderSession();

  const tip = $('tip');
  if (!results.poseLandmarks) tip.textContent = 'No person detected. Move back so your upper body and arms are in frame.';
  else if (!pairs.length && !calibrating) tip.textContent = 'Hands not matched to elbows. Keep your elbow, forearm and hand in view.';
}

function draw(p, zone, w, h) {
  const P = (pt) => [pt.x * w, pt.y * h];
  const [ex, ey] = P(p.elbow);
  const [wx, wy] = P(p.hand[0]);
  const [kx, ky] = P(p.hand[9]);
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.lineWidth = Math.max(4, w / 220);
  ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(wx, wy); ctx.stroke();
  ctx.strokeStyle = COLORS[zone];
  ctx.lineWidth = Math.max(6, w / 160);
  ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(kx, ky); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  for (const pt of p.hand) { const [x, y] = P(pt); ctx.beginPath(); ctx.arc(x, y, Math.max(2, w / 500), 0, Math.PI * 2); ctx.fill(); }
  for (const [x, y, c] of [[ex, ey, '#fff'], [wx, wy, COLORS[zone]]]) {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.arc(x, y, Math.max(6, w / 180), 0, Math.PI * 2); ctx.fill();
  }
}

const ZONE_LABEL = { ok: ['ok', 'OK'], caution: ['warn', 'Caution'], risk: ['risk', 'High'] };
const DIR_LABEL = { extension: 'extension (up)', flexion: 'flexion (down)', ulnar: 'toward pinky (ulnar)', radial: 'toward thumb (radial)' };

function renderHand(side, r) {
  const el = document.querySelector(`.hand[data-side=${side}]`);
  const q = (k) => el.querySelector(`[data-el=${k}]`);
  if (!r) {
    el.classList.add('dim');
    q('deg').textContent = '--';
    q('dir').textContent = '';
    q('zone').className = 'pill';
    q('zone').textContent = 'not seen';
    return;
  }
  el.classList.remove('dim');
  const [cls, label] = ZONE_LABEL[r.zone];
  q('deg').innerHTML = `${Math.round(r.mag)}&deg;`;
  q('dir').textContent = DIR_LABEL[r.dir];
  q('zone').className = `pill ${cls}`;
  q('zone').textContent = label;
  const [min, max] = RANGE[view];
  const clamped = Math.max(min, Math.min(max, r.angle));
  q('needle').style.left = `${((clamped - min) / (max - min)) * 100}%`;
}

function renderSession() {
  if (!session) return;
  const t = session.tracked || 1;
  const pOk = (session.ok / t) * 100;
  const pWarn = (session.caution / t) * 100;
  const pRisk = (session.risk / t) * 100;
  $('zOk').style.width = `${pOk}%`;
  $('zWarn').style.width = `${pWarn}%`;
  $('zRisk').style.width = `${pRisk}%`;
  $('pOk').textContent = `${Math.round(pOk)}%`;
  $('pWarn').textContent = `${Math.round(pWarn)}%`;
  $('pRisk').textContent = `${Math.round(pRisk)}%`;
  const secs = Math.floor((performance.now() - session.start) / 1000);
  $('sessTime').textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

function handleAlert(zone, now) {
  const el = $('alert');
  if (zone !== 'risk') { riskSince = 0; el.classList.add('hidden'); return; }
  if (!riskSince) riskSince = now;
  if (now - riskSince >= settings.alertAfterSec * 1000 && now - lastAlert > 20000) {
    lastAlert = now;
    el.textContent = view === 'side'
      ? 'Wrist bent a lot for a while. Lower your wrist or raise your forearm so the hand lines up with it.'
      : 'Wrist angled sideways for a while. Straighten the hand in line with your forearm.';
    el.classList.remove('hidden');
    if (settings.sound) beep();
  }
}

let audioCtx;
function beep() {
  try {
    audioCtx = audioCtx || new AudioContext();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = 440;
    g.gain.setValueAtTime(0.05, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);
    o.connect(g).connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + 0.3);
  } catch { /* no audio */ }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

init();
