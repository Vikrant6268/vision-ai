// =====================================================================
// app.js – main controller.
//
// Connects buttons to features, manages the status text, and speaks
// every response. Voice commands (Phase 9) will call the SAME `actions`
// table, so a spoken command and a button press always behave
// identically.
// =====================================================================

import * as api from './api.js';
import * as speech from './speech.js';
import * as camera from './camera.js';
import * as walk from './walk.js';
import { t, getLanguage, setLanguage } from './languages.js';

const statusEl   = document.getElementById('status');
const responseEl = document.getElementById('response');
const micBtn     = document.getElementById('btn-mic');
const languageEl = document.getElementById('language');

let busy = false;      // true while a feature runs – blocks double-taps
let responseId = 0;    // lets us ignore "finished" events from cancelled speech

function setStatus(text) {
  statusEl.textContent = text;
}

// Show text on screen AND speak it. Every user-facing message goes
// through here, so nothing is ever visual-only.
async function respond(text) {
  const id = ++responseId;
  responseEl.textContent = text;
  setStatus(t('speaking'));
  await speech.speak(text);
  if (id === responseId) setStatus(t('ready'));   // only if nothing newer started
}

// Make sure the camera is running before a feature that needs a photo.
// A blind user should never have to "turn the camera on" first – we do
// it for them, and only explain if it fails.
async function ensureCamera() {
  if (camera.isOn()) return true;

  setStatus(t('cameraStarting'));
  try {
    await camera.start();
    return true;
  } catch (error) {
    await respond(t(error.code || 'cameraMissing'));
    return false;
  }
}

// ---------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------

// Take a photo and send it to a feature that needs one.
// Both "describe" (Gemini) and "detect" (YOLO) work this way.
async function withPhoto(apiCall) {
  if (busy) return;
  busy = true;

  try {
    if (!(await ensureCamera())) return;

    setStatus(t('processing'));
    const photo = camera.capture();
    const result = await apiCall(photo, getLanguage());
    await respond(result.message);
  } catch (error) {
    console.error(error);
    await respond(error.message);   // api.js guarantees this is speakable
  } finally {
    busy = false;
  }
}

// Shared runner for the features that are still mocked.
async function runFeature(apiCall) {
  if (busy) return;
  busy = true;
  setStatus(t('processing'));

  try {
    const result = await apiCall();
    await respond(result.message);
  } catch (error) {
    console.error(error);
    await respond(error.message);
  } finally {
    busy = false;
  }
}

// Walk Mode needs the camera running continuously.
async function toggleWalk() {
  if (walk.isRunning()) {
    await walk.stop();
    await respond(t('walkOff'));
    return;
  }

  if (!(await ensureCamera())) return;
  await walk.start();
}

async function toggleCamera() {
  if (camera.isOn()) {
    await walk.stop();
    camera.stop();
    await respond(t('cameraOff'));
  } else if (await ensureCamera()) {
    await respond(t('cameraOn'));
  }
}

// ---------------------------------------------------------------------
// Actions – one entry per feature. The key matches the button's
// data-action attribute in index.html.
// ---------------------------------------------------------------------
const actions = {
  camera:   toggleCamera,
  walk:     toggleWalk,
  describe: () => withPhoto(api.describeScene),
  read:      () => withPhoto(api.readText),
  translate: () => withPhoto(api.translateText),
  detect:   () => withPhoto(api.detectObjects),
  person:   () => runFeature(api.recognizePerson),
  repeat:   () => respond(speech.getLastSpoken() || t('nothingToRepeat')),
  stop:     () => { walk.stop(); speech.stop(); setStatus(t('ready')); },
  help:     () => respond(t('help')),
};

// ---------------------------------------------------------------------
// Wire up the interface
// ---------------------------------------------------------------------
document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => actions[button.dataset.action]());
});

// Keep the button's pressed state in sync, including when Walk Mode
// stops by itself. aria-pressed is what a screen reader announces.
const walkBtn = document.getElementById('btn-walk');
walk.onChange((active) => {
  walkBtn.setAttribute('aria-pressed', String(active));
  walkBtn.classList.toggle('active', active);
});

micBtn.addEventListener('click', () => {
  setStatus(t('listening'));
  respond('Voice commands will be connected in a later step. Please use the buttons for now.');
});

languageEl.value = getLanguage();
languageEl.addEventListener('change', () => {
  setLanguage(languageEl.value);
  setStatus(t('ready'));
  respond(t('languageSet'));     // spoken confirmation in the NEW language
});

// Keyboard shortcuts: Space = talk, Escape = stop.
// We check event.key (not event.code) because on-screen keyboards and
// assistive devices often set only event.key.
document.addEventListener('keydown', (event) => {
  const onControl = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);

  if (event.key === ' ' && !onControl) {
    event.preventDefault();
    micBtn.click();
  } else if (event.key === 'Escape') {
    actions.stop();
  }
});

// Stop the camera when the tab is closed, so the webcam light goes off.
window.addEventListener('pagehide', () => { walk.stop(); camera.stop(); });

// ---------------------------------------------------------------------
// Startup: confirm the backend is reachable. If it isn't, say so on the
// screen now and aloud on the first tap – never fail silently.
// ---------------------------------------------------------------------
api.checkHealth()
  .then(() => setStatus(t('ready')))
  .catch((error) => {
    console.error(error);
    setStatus(t('serverDown'));
  });
