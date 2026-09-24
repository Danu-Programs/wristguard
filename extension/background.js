// WristGuard service worker: the timing engine.
// Counts ACTIVE computer minutes (not wall-clock time), treats idle time as rest,
// and runs the two-stage reminder: gentle notification first, focused break window if ignored.
import { getSettings, saveSettings, getState, setState, logEvent } from './shared/store.js';

const TICK = 'wg-tick';
const IDLE_DETECT_SEC = 60;
const MAX_TICK_GAP_MIN = 1.5; // ignore gaps from sleep or a suspended browser

// Serialize state mutations so alarms, idle events and messages never race.
let queue = Promise.resolve();
const locked = (fn) => (queue = queue.then(fn, fn));

async function ensureSetup() {
  chrome.idle.setDetectionInterval(IDLE_DETECT_SEC);
  const alarm = await chrome.alarms.get(TICK);
  if (!alarm) chrome.alarms.create(TICK, { periodInMinutes: 1 });
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  await saveSettings({}); // persist defaults, keep any existing values
  await setState({ lastTick: Date.now() });
  await ensureSetup();
  if (reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#welcome') });
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await setState({ lastTick: Date.now(), idleSince: null, pending: null, breakWindowId: null });
  await ensureSetup();
  await updateBadge();
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === TICK) locked(tick); });

// ---------- schedule helpers ----------
function minutesOfDay(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function withinActiveHours(s, now = new Date()) {
  if (!s.activeHoursEnabled) return true;
  if (!s.activeDays.includes(now.getDay())) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const start = minutesOfDay(s.activeStart);
  const end = minutesOfDay(s.activeEnd);
  return start <= end ? cur >= start && cur < end : cur >= start || cur < end; // supports overnight
}

// ---------- core loop ----------
async function tick() {
  const now = Date.now();
  const s = await getSettings();
  let st = await getState();
  const gap = Math.min(Math.max((now - (st.lastTick || now)) / 60000, 0), MAX_TICK_GAP_MIN);
  st = await setState({ lastTick: now });

  if (st.pausedUntil > now || !withinActiveHours(s)) return updateBadge();
  if (st.pausedUntil && st.pausedUntil <= now) st = await setState({ pausedUntil: 0 });

  const idle = await chrome.idle.queryState(IDLE_DETECT_SEC);
  if (idle !== 'active') return updateBadge();

  st = await setState({
    activeSinceMicro: st.activeSinceMicro + gap,
    activeSinceExercise: st.activeSinceExercise + gap
  });

  // Stage 2: escalate an ignored reminder into a focused break window.
  if (st.pending) {
    const waited = (now - st.pending.firedAt) / 60000;
    if (st.pending.stage === 1 && s.escalate && waited >= s.escalateAfterMin) {
      await setState({ pending: { ...st.pending, stage: 2 } });
      await clearNotifications();
      await openBreak(st.pending.type);
    }
    return updateBadge();
  }

  if (st.snoozeUntil > now) return updateBadge();

  if (s.exerciseEnabled && st.activeSinceExercise >= s.exerciseIntervalMin) await fire('exercise');
  else if (s.microEnabled && st.activeSinceMicro >= s.microIntervalMin) await fire('micro');
  await updateBadge();
}

// Stage 1: gentle notification with actions.
async function fire(type) {
  const s = await getSettings();
  await setState({ pending: { type, firedAt: Date.now(), stage: 1 } });
  const title = type === 'exercise' ? 'Time for a wrist exercise break' : 'Microbreak: rest your hands';
  const message = type === 'exercise'
    ? `You've been typing about ${s.exerciseIntervalMin} minutes. A short guided routine is ready.`
    : `Take ${s.microDurationSec} seconds off the keyboard. Shake out your hands, drop your shoulders.`;
  try {
    await chrome.notifications.create(`wg-${type}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 2,
      requireInteraction: true,
      silent: !s.sound,
      buttons: [{ title: 'Start break' }, { title: `Snooze ${s.snoozeMin} min` }]
    });
  } catch {
    // Notifications blocked at the OS level: go straight to stage 2.
    await openBreak(type);
  }
}

async function clearNotifications() {
  await Promise.all(['wg-micro', 'wg-exercise'].map((id) => chrome.notifications.clear(id)));
}

async function openBreak(type, extra = '') {
  const st = await getState();
  if (st.breakWindowId !== null) {
    try {
      await chrome.windows.update(st.breakWindowId, { focused: true, drawAttention: true });
      return;
    } catch { /* window was closed */ }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL(`break.html?type=${type}${extra}`),
    type: 'popup',
    width: 460,
    height: 640,
    focused: true
  });
  await setState({ breakWindowId: win.id });
}

// Closing the break window without finishing counts as skipping it.
chrome.windows.onRemoved.addListener((id) => locked(async () => {
  const st = await getState();
  if (id !== st.breakWindowId) return;
  if (st.pending) await resolveBreak(st.pending.type, 'skipped');
  await setState({ breakWindowId: null });
}));

async function resolveBreak(type, outcome, extra = {}) {
  const s = await getSettings();
  const patch = { pending: null };
  if (outcome === 'snoozed') {
    patch.snoozeUntil = Date.now() + s.snoozeMin * 60000;
  } else {
    // Completed or skipped: restart the clock so the user is not nagged again immediately.
    patch.activeSinceMicro = 0;
    if (type === 'exercise') patch.activeSinceExercise = 0;
  }
  await setState(patch);
  await clearNotifications();
  if (type !== 'single') await logEvent({ kind: type, outcome, ...extra });
  await updateBadge();
}

chrome.notifications.onButtonClicked.addListener((id, idx) => locked(async () => {
  const type = id === 'wg-exercise' ? 'exercise' : 'micro';
  await chrome.notifications.clear(id);
  if (idx === 0) {
    const st = await getState();
    await setState({ pending: { ...(st.pending || { type, firedAt: Date.now() }), stage: 2 } });
    await openBreak(type);
  } else {
    await resolveBreak(type, 'snoozed');
  }
}));

chrome.notifications.onClicked.addListener((id) => locked(async () => {
  const type = id === 'wg-exercise' ? 'exercise' : 'micro';
  await chrome.notifications.clear(id);
  await openBreak(type);
}));

// ---------- idle = rest ----------
chrome.idle.onStateChanged.addListener((state) => locked(async () => {
  const now = Date.now();
  let st = await getState();
  if (state !== 'active') {
    if (st.idleSince === null) await setState({ idleSince: now - IDLE_DETECT_SEC * 1000 });
    return;
  }
  if (st.idleSince === null) return;
  const s = await getSettings();
  const awayMin = (now - st.idleSince) / 60000;
  const patch = { idleSince: null, lastTick: now };
  // Any detected idle period is at least 60 s, longer than a microbreak.
  if (awayMin * 60 >= s.microDurationSec) patch.activeSinceMicro = 0;
  if (awayMin >= s.naturalBreakMin) {
    patch.activeSinceExercise = 0;
    await logEvent({ kind: 'natural', outcome: 'natural', minutes: Math.round(awayMin) });
  }
  if (st.pending && (st.pending.type === 'micro' ? patch.activeSinceMicro === 0 : patch.activeSinceExercise === 0)) {
    patch.pending = null;
    await clearNotifications();
  }
  await setState(patch);
  await updateBadge();
}));

// ---------- badge ----------
async function updateBadge() {
  const s = await getSettings();
  const st = await getState();
  if (!s.showBadge) return chrome.action.setBadgeText({ text: '' });
  let text = '';
  let color = '#0f766e';
  if (st.pausedUntil > Date.now()) { text = 'off'; color = '#64748b'; }
  else if (st.pending) { text = '!'; color = '#c2410c'; }
  else if (st.snoozeUntil > Date.now()) { text = 'zz'; color = '#64748b'; }
  else {
    const left = nextBreak(s, st);
    if (left) text = `${Math.max(0, Math.ceil(left.minutes))}m`;
  }
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

function nextBreak(s, st) {
  const opts = [];
  if (s.microEnabled) opts.push({ type: 'micro', minutes: s.microIntervalMin - st.activeSinceMicro });
  if (s.exerciseEnabled) opts.push({ type: 'exercise', minutes: s.exerciseIntervalMin - st.activeSinceExercise });
  if (!opts.length) return null;
  return opts.sort((a, b) => a.minutes - b.minutes)[0];
}

// ---------- messages from popup, dashboard, break window ----------
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  locked(async () => {
    const s = await getSettings();
    switch (msg.cmd) {
      case 'status': {
        const st = await getState();
        return reply({
          settings: s,
          state: st,
          next: nextBreak(s, st),
          inActiveHours: withinActiveHours(s)
        });
      }
      case 'startBreak':
        await setState({ pending: { type: msg.type, firedAt: Date.now(), stage: 2 } });
        await openBreak(msg.type);
        return reply({ ok: true });
      case 'tryExercise':
        await openBreak('single', `&id=${encodeURIComponent(msg.id)}`);
        return reply({ ok: true });
      case 'breakDone':
        await resolveBreak(msg.type, 'completed', { seconds: msg.seconds });
        return reply({ ok: true });
      case 'breakSkipped':
        await resolveBreak(msg.type, 'skipped');
        return reply({ ok: true });
      case 'breakSnoozed':
        await resolveBreak(msg.type, 'snoozed');
        return reply({ ok: true });
      case 'pause':
        await setState({ pausedUntil: Date.now() + msg.minutes * 60000, pending: null });
        await clearNotifications();
        await updateBadge();
        return reply({ ok: true });
      case 'resume':
        await setState({ pausedUntil: 0, lastTick: Date.now() });
        await updateBadge();
        return reply({ ok: true });
      case 'resetTimers':
        await setState({ activeSinceMicro: 0, activeSinceExercise: 0, pending: null, snoozeUntil: 0 });
        await clearNotifications();
        await updateBadge();
        return reply({ ok: true });
      case 'settingsChanged':
        await updateBadge();
        return reply({ ok: true });
      default:
        return reply({ ok: false, error: 'unknown command' });
    }
  });
  return true; // async reply
});
