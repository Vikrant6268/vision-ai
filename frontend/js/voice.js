// =====================================================================
// voice.js - listening to the user.
//
// Uses the browser's built-in Web Speech API: free, no API key.
//
// Designed for CONTINUOUS use. Once started it keeps listening and
// restarts itself whenever the browser stops it, which Chrome does
// often - after a pause, after each result, after an error. Without
// that restart loop a user who cannot see the screen would have no way
// to know the microphone had quietly died.
//
// THE MICROPHONE IS OFF WHILE THE APP IS SPEAKING.
//
// The first version kept listening and tried to ignore whatever arrived
// while we were talking. That failed: Chrome delivers a transcript a
// second or more after the words were spoken, so the app's own voice
// arrived as a "command", matched nothing, and the app replied "Sorry,
// say help" - which it then heard too, and replied to again. In use the
// app kept asking for "help" and missed what the user actually said.
//
// Now recognition is paused the moment speech starts and resumed a
// moment after it ends, so the microphone never hears the app at all.
//
// Two more filters keep stray sounds out:
//   - very short results (a cough, a click) are ignored
//   - results the recogniser itself is unsure about are ignored
// =====================================================================

import { speechTag } from './languages.js';
import * as speech from './speech.js';

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

// Chrome stops recognition on its own; restart after a short gap.
const RESTART_DELAY_MS = 300;

// After we stop speaking, wait this long before listening again, so the
// tail of our own audio (and its echo in the room) is not picked up.
const RESUME_DELAY_MS = 700;

// Shorter than this many letters is noise, not a command.
const MIN_LETTERS = 2;

// Chrome scores each result from 0 to 1. Below this it is usually a
// mis-hearing. (Some versions always report 0, meaning "unknown"; those
// results are kept.)
const MIN_CONFIDENCE = 0.4;

let recognition = null;
let running = false;      // the user wants voice commands on
let paused = false;       // temporarily off while the app speaks
let restartTimer = null;
let resumeTimer = null;

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

function letterCount(text) {
  return (text.match(/\p{L}/gu) || []).length;
}

function build() {
  const instance = new SpeechRecognition();

  instance.lang = speechTag();
  instance.continuous = true;
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  instance.onresult = (event) => {
    // Belt and braces: nothing heard while we are speaking is a command.
    if (paused || speech.isSpeaking()) return;

    const result = event.results[event.results.length - 1];
    if (!result.isFinal) return;

    const { transcript, confidence } = result[0];
    const text = transcript.trim();

    if (letterCount(text) < MIN_LETTERS) return;
    if (confidence > 0 && confidence < MIN_CONFIDENCE) return;

    onHeard(text);
    onCommand(text);
  };

  instance.onerror = (event) => {
    // "no-speech" and "aborted" are normal in continuous use.
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      running = false;
      onStateChange(false, 'denied');
      return;
    }
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('Speech recognition error:', event.error);
    }
  };

  // Chrome ends recognition regularly. Start it again so listening
  // really is continuous - unless we paused it on purpose.
  instance.onend = () => {
    if (!running || paused) return;
    clearTimeout(restartTimer);
    restartTimer = setTimeout(listen, RESTART_DELAY_MS);
  };

  return instance;
}

function listen() {
  if (!running || paused || !recognition) return;
  try {
    recognition.start();
  } catch {
    // Already started - harmless.
  }
}

// Switch the microphone off while the app talks, back on afterwards.
speech.onSpeakingChange((speaking) => {
  if (!running) return;

  clearTimeout(resumeTimer);

  if (speaking) {
    paused = true;
    clearTimeout(restartTimer);
    try { recognition?.abort(); } catch { /* already stopped */ }
  } else {
    resumeTimer = setTimeout(() => {
      paused = false;
      listen();
    }, RESUME_DELAY_MS);
  }
});

export function start() {
  if (!isSupported() || running) return;

  recognition = build();
  running = true;
  paused = speech.isSpeaking();   // if we are mid-sentence, wait for it to end

  if (!paused) listen();
  onStateChange(true);
}

export function stop() {
  running = false;
  paused = false;
  clearTimeout(restartTimer);
  clearTimeout(resumeTimer);

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
