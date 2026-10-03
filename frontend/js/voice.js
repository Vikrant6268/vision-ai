// =====================================================================
// voice.js - listening to the user.
//
// Uses the browser's built-in Web Speech API: free, no API key, and
// no audio leaves the machine except to the browser's own recogniser.
//
// Designed for CONTINUOUS use. Once started it keeps listening and
// restarts itself whenever the browser stops it, which Chrome does
// often - after a pause, after each result, after an error. Without
// that restart loop a user who cannot see the screen would have no way
// to know the microphone had quietly died.
//
// Two rules that matter more than the recognition itself:
//
//   1. We IGNORE everything heard while the app is speaking, otherwise
//      it hears its own voice and triggers itself in a loop.
//   2. An unrecognised phrase gets a short spoken reply, never silence.
//      Silence is indistinguishable from a broken microphone.
// =====================================================================

import { speechTag, t } from './languages.js';
import * as speech from './speech.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Chrome stops recognition on its own; restart after a short gap.
const RESTART_DELAY_MS = 300;

// Ignore anything heard within this long after we finish speaking, to
// avoid picking up the tail of our own audio.
const SELF_ECHO_GUARD_MS = 400;

let recognition = null;
let running = false;
let restartTimer = null;
let lastSpokeAt = 0;

let onCommand = () => {};
let onStateChange = () => {};
let onHeard = () => {};

export function isSupported() {
  return Boolean(SpeechRecognition);
}

export function isRunning() {
  return running;
}

export function onResult(callback) {
  onCommand = callback;
}

export function onChange(callback) {
  onStateChange = callback;
}

// Lets the UI show what was heard, which helps a sighted helper debug.
export function onTranscript(callback) {
  onHeard = callback;
}

function build() {
  const instance = new SpeechRecognition();

  instance.lang = speechTag();
  instance.continuous = true;
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  instance.onresult = (event) => {
    // Our own speech can reach the microphone; ignore it.
    if (speech.isSpeaking() || Date.now() - lastSpokeAt < SELF_ECHO_GUARD_MS) return;

    const result = event.results[event.results.length - 1];
    if (!result.isFinal) return;

    const transcript = result[0].transcript.trim();
    if (!transcript) return;

    onHeard(transcript);
    onCommand(transcript);
  };

  instance.onerror = (event) => {
    // "no-speech" and "aborted" are normal in continuous use.
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      running = false;
      onStateChange(false, 'denied');
      return;
    }
    console.warn('Speech recognition error:', event.error);
  };

  // Chrome ends recognition regularly. Start it again so listening
  // really is continuous.
  instance.onend = () => {
    if (!running) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(() => {
      try {
        instance.start();
      } catch {
        // Already starting - harmless.
      }
    }, RESTART_DELAY_MS);
  };

  return instance;
}

export function start() {
  if (!isSupported() || running) return;

  recognition = build();
  running = true;

  try {
    recognition.start();
    onStateChange(true);
  } catch {
    running = false;
    onStateChange(false, 'failed');
  }
}

export function stop() {
  running = false;
  clearTimeout(restartTimer);

  if (recognition) {
    recognition.onend = null;      // don't let the restart loop fire
    try { recognition.abort(); } catch { /* already stopped */ }
    recognition = null;
  }

  onStateChange(false);
}

// The recogniser's language is fixed when it is created, so switching
// app language means rebuilding it.
export function restartForLanguage() {
  if (!running) return;
  stop();
  start();
}

// Called by app.js whenever we finish speaking, to set the echo guard.
export function markSpoke() {
  lastSpokeAt = Date.now();
}
