// =====================================================================
// walk.js – Walk Mode: continuous obstacle alerts.
//
// The camera is checked a few times a second, but the app stays SILENT
// unless something large is actually in the way. Constant narration
// would make the app unusable while walking, and would drown out real
// warnings.
//
// The announcement policy is the important part of this file:
//
//   detection
//      ↓  is it big AND in the way?            (server decides)
//      ↓  have we just said this?              (cooldown)
//      ↓  are we already speaking?             (no talking over)
//      ↓
//   speak
//
// IMPORTANT: this is an assistive aid, not a guarantee. It can miss
// objects, and it cannot measure distance.
// =====================================================================

import * as api from './api.js';
import * as speech from './speech.js';
import * as camera from './camera.js';
import { t, getLanguage } from './languages.js';

// How often to look. Detection takes about 80ms, so 2 checks/second
// leaves plenty of headroom. Raised from 1.2/s after testing showed
// warnings arriving too late.
const INTERVAL_MS = 500;

// Don't repeat the same warning more often than this.
const COOLDOWN_MS = 4000;

// Give up on a frame that takes too long rather than queueing requests.
const REQUEST_TIMEOUT_MS = 4000;

// Stop after repeated failures instead of retrying forever in silence.
const MAX_FAILURES = 5;

// A "blocked view" must be seen twice in a row before we announce it.
// Swinging the camera briefly blurs the frame, and one blurred frame
// should not sound an alarm.
const BLOCKED_CONFIRMATIONS = 2;

let running = false;
let timer = null;
let inFlight = false;
let failures = 0;
let blockedStreak = 0;

// alertKey → timestamp of the last time we said it.
const lastAnnounced = new Map();

let onStateChange = () => {};

export function isRunning() {
  return running;
}

// Let app.js react when Walk Mode stops by itself (camera lost, errors).
export function onChange(callback) {
  onStateChange = callback;
}

function shouldAnnounce(key) {
  const previous = lastAnnounced.get(key);
  return !previous || Date.now() - previous >= COOLDOWN_MS;
}

async function checkFrame() {
  // Skip this tick if the previous one is still running, or if we are
  // mid-sentence. Both would pile up audio the user cannot follow.
  if (!running || inFlight || speech.isSpeaking()) return;

  inFlight = true;

  try {
    const photo = camera.capture();
    const result = await api.detectObjects(photo, getLanguage(), REQUEST_TIMEOUT_MS);

    failures = 0;

    // Require consecutive blocked frames; a single blurred frame while
    // turning is not an obstacle.
    blockedStreak = result.viewBlocked ? blockedStreak + 1 : 0;

    const blockedConfirmed = blockedStreak >= BLOCKED_CONFIRMATIONS;
    const isBlockedAlert = result.alertKey === 'blocked';

    if (isBlockedAlert && !blockedConfirmed) return;

    if (result.alert && shouldAnnounce(result.alertKey)) {
      lastAnnounced.set(result.alertKey, Date.now());
      await speech.speak(result.alert);
    }
  } catch (error) {
    failures += 1;
    console.warn('Walk Mode check failed:', error.message);

    if (failures >= MAX_FAILURES) {
      // Tell the user why it stopped. Never fail silently.
      await stop();
      await speech.speak(error.message);
    }
  } finally {
    inFlight = false;
  }
}

export async function start() {
  if (running) return;

  running = true;
  failures = 0;
  blockedStreak = 0;
  lastAnnounced.clear();

  timer = setInterval(checkFrame, INTERVAL_MS);
  onStateChange(true);

  await speech.speak(t('walkOn'));
}

export async function stop() {
  if (!running) return;

  running = false;
  clearInterval(timer);
  timer = null;
  onStateChange(false);
}
