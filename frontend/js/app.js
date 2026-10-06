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
import * as detection from './detection.js';
import * as voice from './voice.js';
import { match } from './commands.js';
import { t, getLanguage, setLanguage, uiPhrases } from './languages.js';

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
//
// `segments` is the same message split into short phrases by the server.
// Spoken separately, the fixed ones are already cached and the rest are
// fetched in parallel, so the answer starts sooner.
async function respond(text, segments = null) {
  const id = ++responseId;
  responseEl.textContent = text;
  setStatus(t('speaking'));
  await speech.speak(segments ?? text);
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

// Take a photo and send it to a feature that needs one: "describe"
// (Gemini) and "read" (Gemini OCR) work this way.
async function withPhoto(apiCall) {
  if (busy) return;
  busy = true;

  try {
    if (!(await ensureCamera())) return;

    setStatus(t('processing'));
    const photo = camera.capture();
    const result = await apiCall(photo, getLanguage());
    await respond(result.message, result.segments);
  } catch (error) {
    console.error(error);
    await respond(error.message);   // api.js guarantees this is speakable
  } finally {
    busy = false;
  }
}

// Make sure object detection can run. On a phone the first use downloads
// the detection model (about 13 MB), which can take a while on mobile
// data - so the user is told, instead of waiting in silence.
async function ensureDetection() {
  try {
    if (await detection.needsDownload()) {
      setStatus(t('detectionLoading'));
      speech.speak(t('detectionLoading'));   // not awaited: download meanwhile
    }
    await detection.prepare();
    return true;
  } catch (error) {
    console.error(error);
    await respond(t('detectionFailed'));
    return false;
  }
}

// Detect Objects: one look at the scene, answered aloud.
async function detectNow() {
  if (busy) return;
  busy = true;

  try {
    if (!(await ensureCamera())) return;
    if (!(await ensureDetection())) return;

    setStatus(t('processing'));
    const result = await detection.detect(getLanguage());
    await respond(result.message, result.segments);
  } catch (error) {
    console.error(error);
    await respond(t('detectionFailed'));
  } finally {
    busy = false;
  }
}

async function toggleWalk() {
  if (walk.isRunning()) {
    await walk.stop();
    await respond(t('walkOff'));
    return;
  }

  if (!(await ensureCamera())) return;
  if (!(await ensureDetection())) return;
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
  camera:    toggleCamera,
  walk:      toggleWalk,
  describe:  () => withPhoto(api.describeScene),
  read:      () => withPhoto(api.readText),
  detect:    detectNow,
  repeat:    () => respond(speech.getLastSpoken() || t('nothingToRepeat')),
  stop:      () => { walk.stop(); speech.stop(); setStatus(t('ready')); },
  help:      () => respond(t('help')),
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

// ---------------------------------------------------------------------
// Voice commands
// ---------------------------------------------------------------------

// Ask the server to pre-generate this language's fixed phrases (warnings,
// help, errors) in the background. Does nothing on a device that has its
// own voice for the language.
function warmSpeech() {
  speech.warm(uiPhrases(getLanguage()));
}

// Something was heard but matched no command. We must reply - silence
// would be indistinguishable from a dead microphone for someone who
// cannot see the screen - but not to EVERY stray phrase: background
// talk or a TV can produce a stream of them, and answering each one
// would drown out the user. So: a short reply, at most once every few
// seconds, and the hint about "help" only after several misses in a row.
const MISS_REPLY_GAP_MS = 8000;
const MISSES_BEFORE_HINT = 3;
let lastMissReplyAt = 0;
let missesInARow = 0;

function notUnderstood() {
  missesInARow += 1;

  if (Date.now() - lastMissReplyAt < MISS_REPLY_GAP_MS) return;
  lastMissReplyAt = Date.now();

  respond(t(missesInARow >= MISSES_BEFORE_HINT ? 'notUnderstoodHelp' : 'notUnderstood'));
}

// Run whatever the user asked for.
function handleCommand(transcript) {
  const result = match(transcript);

  if (!result) {
    notUnderstood();
    return;
  }

  missesInARow = 0;

  if (result.type === 'language') {
    setLanguage(result.code);
    languageEl.value = result.code;
    voice.restartForLanguage();        // recogniser language is fixed at creation
    warmSpeech();
    respond(t('languageSet'));
    return;
  }

  actions[result.action]();
}

function toggleVoice() {
  if (!voice.isSupported()) {
    respond(t('voiceUnsupported'));
    return;
  }

  if (voice.isRunning()) {
    voice.stop();
    respond(t('voiceOff'));
  } else {
    voice.start();
    respond(t('voiceOn'));
  }
}

voice.onResult(handleCommand);

voice.onChange((active, reason) => {
  micBtn.setAttribute('aria-pressed', String(active));
  micBtn.classList.toggle('listening', active);

  if (active) {
    setStatus(t('listening'));
  } else if (reason === 'denied') {
    respond(t('micDenied'));
  } else {
    setStatus(t('ready'));
  }
});

// Show what was heard, which helps when testing with a sighted helper.
voice.onTranscript((text) => {
  responseEl.textContent = `"${text}"`;
});

micBtn.addEventListener('click', toggleVoice);

languageEl.value = getLanguage();
languageEl.addEventListener('change', () => {
  setLanguage(languageEl.value);
  voice.restartForLanguage();    // listen in the new language too
  warmSpeech();
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
window.addEventListener('pagehide', () => { voice.stop(); walk.stop(); camera.stop(); });

// ---------------------------------------------------------------------
// Startup: confirm the backend is reachable. If it isn't, say so on the
// screen now and aloud on the first tap – never fail silently.
// ---------------------------------------------------------------------
warmSpeech();

api.checkHealth()
  .then(() => setStatus(t('ready')))
  .catch((error) => {
    console.error(error);
    setStatus(t('serverDown'));
  });
