// =====================================================================
// walk.js – Walk Mode: continuous obstacle alerts.
//
// The camera is checked twice a second, but the app stays SILENT unless
// something is actually in the way, and it warns once when the obstacle
// appears rather than repeatedly while it stays. When to speak is
// decided in alertPolicy.js; this file does the camera, the network and
// the sound.
//
//   frame → server (YOLO + proximity) → alert key
//             ↓
//        alertPolicy: appeared?  already warned?  gone?
//             ↓
//        tone at once  →  spoken warning follows
//
// Two things keep a warning honest:
//
//   - Frames keep being checked WHILE a warning is being prepared, so the
//     app always knows the current situation.
//   - Just before the warning is heard we check again. If the obstacle
//     has gone in the meantime the warning is dropped, rather than
//     telling someone about something that is no longer there.
//
// IMPORTANT: this is an assistive aid, not a guarantee. It can miss
// objects, and it cannot measure distance.
// =====================================================================

import * as detection from './detection.js';
import * as speech from './speech.js';
import * as sound from './sound.js';
import { createAlertPolicy } from './alertPolicy.js';
import { t, getLanguage } from './languages.js';

// Detection takes about 80 ms, so two checks a second leaves headroom.
const INTERVAL_MS = 500;

// Give up on a frame that takes too long rather than queueing requests.
const REQUEST_TIMEOUT_MS = 4000;

// Stop after repeated failures instead of retrying forever in silence.
const MAX_FAILURES = 5;

// "Blocked" and "dark" must be seen twice in a row. Swinging the camera
// briefly blurs a frame, and one blurred frame should not sound an alarm.
const CONFIRM_FRAMES = 2;
const NEEDS_CONFIRMATION = new Set(['blocked', 'dark']);

let running = false;
let timer = null;
let inFlight = false;
let failures = 0;
let streak = { key: null, count: 0 };
let currentKey = null;       // what the most recent frame showed

const policy = createAlertPolicy();

let onStateChange = () => {};

export function isRunning() {
  return running;
}

// Let app.js react when Walk Mode stops by itself (camera lost, errors).
export function onChange(callback) {
  onStateChange = callback;
}

// Count how many frames in a row showed the same thing, so brief
// glitches never reach the policy.
function confirmed(key) {
  streak = key === streak.key ? { key, count: streak.count + 1 } : { key, count: 1 };

  if (key && NEEDS_CONFIRMATION.has(key) && streak.count < CONFIRM_FRAMES) return null;
  return key;
}

async function announce(key, text) {
  // The tone is immediate; the spoken warning follows when it is ready.
  sound.beep(NEEDS_CONFIRMATION.has(key) ? 'urgent' : 'alert');

  const voice = speech.prepare(text);
  await voice.play(() => currentKey === key);   // dropped if already gone
}

async function checkFrame() {
  if (!running || inFlight) return;

  inFlight = true;

  try {
    const result = await detection.detect(getLanguage(), REQUEST_TIMEOUT_MS);

    failures = 0;

    currentKey = confirmed(result.alertKey ?? null);

    const decision = policy.update(currentKey);

    if (decision === 'announce') {
      announce(currentKey, result.alert);        // not awaited: keep checking frames
    } else if (decision === 'remind') {
      sound.beep('reminder');                    // a tone only, no repeated speech
    }
  } catch (error) {
    failures += 1;
    console.warn('Walk Mode check failed:', error.message);

    if (failures >= MAX_FAILURES) {
      // Tell the user why it stopped. Never fail silently.
      await stop();
      await speech.speak(t('detectionFailed'));
    }
  } finally {
    inFlight = false;
  }
}

export async function start() {
  if (running) return;

  running = true;
  failures = 0;
  streak = { key: null, count: 0 };
  currentKey = null;
  policy.reset();

  timer = setInterval(checkFrame, INTERVAL_MS);
  onStateChange(true);

  await speech.speak(t('walkOn'));
}

export async function stop() {
  if (!running) return;

  running = false;
  clearInterval(timer);
  timer = null;
  currentKey = null;
  onStateChange(false);
}
