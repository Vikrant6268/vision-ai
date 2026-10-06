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
// say help" - which it then heard too, and replied to again.
//
// Now recognition is stopped the moment speech starts and restarted a
// moment after it ends, so the microphone never hears the app at all.
//
// A FRESH RECOGNISER FOR EVERY LISTENING SESSION.
//
// On Android, a recogniser that is stopped before it has fully started
// can refuse to start again - silently. That is exactly what happens
// when the user taps the microphone: listening starts, and a moment
// later the app stops it to say "I am listening". Reusing that same
// recogniser left the microphone dead on phones with no error at all.
// Creating a new one each time avoids the problem entirely.
//
// One phrase per session: Chrome on Android ignores "continuous" mode
// and stops after each phrase anyway, so laptops and phones behave the
// same way.
//
// ERRORS ARE NEVER SILENT. If the microphone, the network or the
// language is the problem, the app is told and says so aloud.
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

// Safety net: if the app has been "speaking" for longer than this, the
// microphone is switched back on anyway.
const MAX_PAUSE_MS = 60000;

// This many sessions in a row ending in an error (not silence) means
// something is really wrong: stop and tell the user, rather than retry
// forever while they wonder why nothing happens.
const MAX_ERRORS_IN_A_ROW = 4;

// Errors that are part of normal use and are simply retried.
const ROUTINE_ERRORS = new Set(['no-speech', 'aborted']);

// Errors that will not fix themselves by retrying.
const FATAL_ERRORS = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported']);

let recognition = null;   // the recogniser for the current session
let running = false;      // the user wants voice commands on
let paused = false;       // temporarily off while the app speaks
let errorsInARow = 0;
let lastErrorReason = 'failed';   // best explanation if we have to give up
let restartTimer = null;
let resumeTimer = null;
let pauseGuard = null;

let onCommand = () => {};
let onStateChange = () => {};
let onHeard = () => {};
let onEvent = () => {};

export function isSupported() {
  return Boolean(SpeechRecognition);
}

export function isRunning() {
  return running;
}

export function onResult(callback) {
  onCommand = callback;
}

// callback(active, reason) - reason explains why listening stopped:
// 'denied', 'network', 'audio-capture', 'language-not-supported', 'failed'.
export function onChange(callback) {
  onStateChange = callback;
}

// Lets the UI show what was heard, which helps a sighted helper debug.
export function onTranscript(callback) {
  onHeard = callback;
}

// Every recogniser event, for the on-screen diagnostic view.
export function onDebug(callback) {
  onEvent = callback;
}

function letterCount(text) {
  return (text.match(/\p{L}/gu) || []).length;
}

// Stop listening for good and report why.
function giveUp(reason) {
  running = false;
  discard();
  onStateChange(false, reason);
}

// Throw away the current recogniser without triggering a restart.
function discard() {
  const old = recognition;
  recognition = null;
  if (!old) return;
  old.onresult = null;
  old.onerror = null;
  old.onend = null;
  try { old.abort(); } catch { /* already stopped */ }
}

function scheduleListen(delay) {
  clearTimeout(restartTimer);
  restartTimer = setTimeout(listen, delay);
}

function listen() {
  if (!running || paused) return;

  discard();

  const instance = new SpeechRecognition();
  recognition = instance;

  instance.lang = speechTag();
  instance.continuous = false;          // one phrase per session, see above
  instance.interimResults = false;
  instance.maxAlternatives = 1;

  let failed = false;

  instance.onstart = () => onEvent('start', instance.lang);
  instance.onspeechstart = () => onEvent('speech detected');

  instance.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    if (!result.isFinal) return;

    const text = result[0].transcript.trim();
    onEvent('heard', text);

    // Belt and braces: nothing heard while we are speaking is a command.
    if (paused || speech.isSpeaking()) return;
    if (letterCount(text) < MIN_LETTERS) return;

    errorsInARow = 0;
    onHeard(text);
    onCommand(text);
  };

  instance.onerror = (event) => {
    onEvent('error', event.error);
    if (ROUTINE_ERRORS.has(event.error)) return;

    failed = true;
    if (event.error === 'network' || event.error === 'audio-capture') lastErrorReason = event.error;

    if (FATAL_ERRORS.has(event.error)) {
      giveUp(event.error === 'language-not-supported' ? event.error : 'denied');
    }
  };

  instance.onend = () => {
    onEvent('end');
    if (instance !== recognition) return;           // an old recogniser

    if (failed) {
      errorsInARow += 1;
      if (errorsInARow >= MAX_ERRORS_IN_A_ROW) {
        giveUp(lastErrorReason);
        return;
      }
    }

    if (running && !paused) scheduleListen(RESTART_DELAY_MS);
  };

  try {
    instance.start();
  } catch (error) {
    // Starting failed outright. Count it and try again shortly; after
    // several failures the user is told.
    onEvent('start failed', error.name);
    errorsInARow += 1;
    if (errorsInARow >= MAX_ERRORS_IN_A_ROW) giveUp('failed');
    else scheduleListen(RESTART_DELAY_MS * 3);
  }
}

// Switch the microphone off while the app talks, back on afterwards.
speech.onSpeakingChange((speaking) => {
  if (!running) return;

  clearTimeout(resumeTimer);
  clearTimeout(pauseGuard);

  const resume = () => {
    paused = false;
    listen();
  };

  if (speaking) {
    paused = true;
    clearTimeout(restartTimer);
    discard();
    pauseGuard = setTimeout(resume, MAX_PAUSE_MS);
  } else {
    resumeTimer = setTimeout(resume, RESUME_DELAY_MS);
  }
});

export function start() {
  if (!isSupported() || running) return;

  running = true;
  errorsInARow = 0;
  lastErrorReason = 'failed';
  paused = speech.isSpeaking();   // if we are mid-sentence, wait for it to end

  if (!paused) listen();
  onStateChange(true);
}

export function stop() {
  running = false;
  paused = false;
  clearTimeout(restartTimer);
  clearTimeout(resumeTimer);
  clearTimeout(pauseGuard);
  discard();
  onStateChange(false);
}

// The recogniser's language is fixed when it is created, so switching
// app language means starting a new one.
export function restartForLanguage() {
  if (!running) return;
  stop();
  start();
}
