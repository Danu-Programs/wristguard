// Storage layer. Uses chrome.storage.local inside the extension and falls back to
// localStorage on the standalone website, so the posture checker runs in both.
import { DEFAULT_SETTINGS } from './config.js';

const HISTORY_DAYS = 90;
const hasChrome = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;

async function rawGet(key) {
  if (hasChrome) return (await chrome.storage.local.get(key))[key];
  try {
    const v = localStorage.getItem(`wristguard:${key}`);
    return v ? JSON.parse(v) : undefined;
  } catch {
    return undefined;
  }
}

async function rawSet(key, value) {
  if (hasChrome) return chrome.storage.local.set({ [key]: value });
  try { localStorage.setItem(`wristguard:${key}`, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export const DEFAULT_STATE = {
  activeSinceMicro: 0,      // minutes of active computer time since last rest
  activeSinceExercise: 0,
  pending: null,            // { type, firedAt, stage }
  snoozeUntil: 0,
  pausedUntil: 0,
  idleSince: null,
  lastTick: 0,
  breakWindowId: null
};

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await rawGet('settings')) || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await rawSet('settings', next);
  return next;
}

export async function getState() {
  return { ...DEFAULT_STATE, ...((await rawGet('state')) || {}) };
}

export async function setState(patch) {
  const next = { ...(await getState()), ...patch };
  await rawSet('state', next);
  return next;
}

// History events: { ts, kind: 'micro'|'exercise'|'natural'|'posture', outcome, ...extra }
export async function getHistory() {
  return (await rawGet('history')) || [];
}

export async function logEvent(event) {
  const cutoff = Date.now() - HISTORY_DAYS * 864e5;
  const history = (await getHistory()).filter((e) => e.ts >= cutoff);
  history.push({ ts: Date.now(), ...event });
  await rawSet('history', history);
}

export async function clearHistory() {
  await rawSet('history', []);
}

export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Summaries used by the popup and dashboard.
export function summarize(history, now = Date.now()) {
  const today = dayKey(now);
  const t = { completed: 0, skipped: 0, snoozed: 0, natural: 0, exerciseCompleted: 0 };
  for (const e of history) {
    if (dayKey(e.ts) !== today || e.kind === 'posture') continue;
    if (e.outcome === 'completed') { t.completed++; if (e.kind === 'exercise') t.exerciseCompleted++; }
    else if (e.outcome === 'skipped') t.skipped++;
    else if (e.outcome === 'snoozed') t.snoozed++;
    else if (e.outcome === 'natural') t.natural++;
  }
  const decided = t.completed + t.skipped;
  t.followRate = decided ? Math.round((t.completed / decided) * 100) : null;

  // Streak: consecutive days (ending today or yesterday) with at least one completed break.
  const days = new Set(history.filter((e) => e.outcome === 'completed').map((e) => dayKey(e.ts)));
  let streak = 0;
  const d = new Date(now);
  if (!days.has(dayKey(d.getTime()))) d.setDate(d.getDate() - 1);
  while (days.has(dayKey(d.getTime()))) { streak++; d.setDate(d.getDate() - 1); }
  t.streak = streak;
  return t;
}

export function lastNDays(history, n = 7, now = Date.now()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = dayKey(d.getTime());
    const row = { key, label: d.toLocaleDateString(undefined, { weekday: 'short' }), completed: 0, skipped: 0 };
    for (const e of history) {
      if (e.kind === 'posture' || dayKey(e.ts) !== key) continue;
      if (e.outcome === 'completed') row.completed++;
      else if (e.outcome === 'skipped') row.skipped++;
    }
    out.push(row);
  }
  return out;
}
