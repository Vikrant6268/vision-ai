// =====================================================================
// app.js – main controller.
//
// Connects the buttons to features, manages the status text, and speaks
// every response. The camera (Phase 6) and voice input (Phase 9) will
// plug into the same `actions` table below, so a spoken command and a
// button press always do exactly the same thing.
// =====================================================================

import * as api from './api.js';
import * as speech from './speech.js';

const statusEl   = document.getElementById('status');
const responseEl = document.getElementById('response');
const micBtn     = document.getElementById('btn-mic');

let busy = false;      // true while a feature is running – blocks double-taps
let responseId = 0;    // lets us ignore "finished" events from cancelled speech

function setStatus(text) {
  statusEl.textContent = text;
}

// Show text on screen AND speak it. Every user-facing message goes
// through here, so nothing is ever visual-only.
async function respond(text) {
  const id = ++responseId;
  responseEl.textContent = text;
  setStatus('Speaking...');
  await speech.speak(text);
  if (id === responseId) setStatus('Ready');   // only if nothing newer started
}

// Run one feature end-to-end: guard against double-taps, show progress,
// call the API, speak the result, handle failure gracefully.
async function runFeature(apiCall) {
  if (busy) return;
  busy = true;
  setStatus('Processing...');

  try {
    const result = await apiCall();
    await respond(result.message);
  } catch (error) {
    console.error(error);
    await respond(error.message);   // api.js guarantees this is user-friendly
  } finally {
    busy = false;
  }
}

// ---------------------------------------------------------------------
// Actions – one entry per feature.
// The key matches the button's data-action attribute in index.html.
// ---------------------------------------------------------------------
const actions = {
  camera:   () => respond('The camera will be connected in a later step.'),
  read:     () => runFeature(api.readText),
  detect:   () => runFeature(api.detectObjects),
  describe: () => runFeature(api.describeScene),
  person:   () => runFeature(api.recognizePerson),
  repeat:   () => respond(speech.getLastSpoken() || 'There is nothing to repeat yet.'),
  stop:     () => { speech.stop(); setStatus('Ready'); },
  help:     () => respond(
    'You can say: read this, detect objects, describe surroundings, ' +
    'who is this, repeat, stop, or help.'
  ),
};

// ---------------------------------------------------------------------
// Wire up the interface
// ---------------------------------------------------------------------
document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => actions[button.dataset.action]());
});

micBtn.addEventListener('click', () => {
  setStatus('Listening...');
  respond('Voice commands will be connected in a later step. Please use the buttons for now.');
});

// Keyboard shortcuts: Space = talk, Escape = stop.
// We check event.key (not event.code) because on-screen keyboards and
// assistive devices often set only event.key.
// Space is ignored when a button has focus, otherwise it would fire twice.
document.addEventListener('keydown', (event) => {
  const onControl = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName);

  if (event.key === ' ' && !onControl) {
    event.preventDefault();
    micBtn.click();
  } else if (event.key === 'Escape') {
    actions.stop();
  }
});

// ---------------------------------------------------------------------
// Startup: confirm the backend is reachable. If it isn't, say so on the
// screen now and aloud on the first tap – never fail silently.
// ---------------------------------------------------------------------
api.checkHealth()
  .then(() => setStatus('Ready'))
  .catch((error) => {
    console.error(error);
    setStatus('Server not reachable');
  });
