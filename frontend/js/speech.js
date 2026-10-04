// =====================================================================
// speech.js – the app's voice.
//
// Three goals, in this order:
//
//   1. Something is always audible. A blind user cannot see an error, so
//      a failure must be SPOKEN, never silent.
//   2. Speech starts quickly.
//   3. Long text (a scanned page) must work, not just short sentences.
//
// HOW IT CHOOSES A VOICE
//
//   The device has a voice for the language   → use it. Instant, free,
//        (English everywhere; Hindi, Marathi,   works offline. This is the
//        Gujarati on Android Chrome)            normal case on a phone.
//   Otherwise (e.g. a Windows laptop)         → ask the server, which uses
//                                               neural voices (/api/speech).
//
// HOW IT STAYS FAST ON LONG TEXT
//
//   The text is cut into short pieces. Piece 1 is requested immediately
//   and piece 2 is requested while piece 1 is still playing, so the
//   listener waits for ONE short piece, not for the whole page. A 440
//   character text used to take over two minutes to synthesise in one
//   go; in pieces it starts speaking within a couple of seconds.
// =====================================================================

import { speechTag, getLanguage } from './languages.js';
import { splitText } from './textSplit.js';

// Spoken when the server voice fails and the device has no voice for the
// language. English, because every device can speak it: a message the
// user can hear beats a perfect one they cannot.
const SPEECH_DOWN = 'Speech is busy right now. Please try again in a moment.';

const CLIP_CACHE_LIMIT = 80;

let lastSpoken = '';
let playing = false;          // true from the start of speak() until it finishes
let playToken = 0;            // bumped to cancel whatever is currently speaking
let audio = null;             // the <audio> element currently playing
let finishCurrent = null;     // resolves the piece that is playing right now
let utterance = null;         // kept referenced: Chrome drops unreferenced ones mid-speech

// language|text → Promise of an audio data URL. Storing the promise (not
// the result) means two requests for the same text share one download.
const clips = new Map();

// ---------------------------------------------------------------------
// Which voice?
// ---------------------------------------------------------------------

// Chrome fills the voice list in asynchronously; asking once at load
// starts that, so the list is ready by the time we need it.
if ('speechSynthesis' in window) window.speechSynthesis.getVoices();

function deviceHasVoice() {
  if (!('speechSynthesis' in window)) return false;

  const language = getLanguage();
  if (language === 'en') return true;     // every device can speak English

  return window.speechSynthesis
    .getVoices()
    .some((voice) => voice.lang.toLowerCase().startsWith(language));
}

// Accepts a string, or an array of already-separate phrases (the server
// sends these for detections: each is short and usually cached).
function toPieces(input) {
  const parts = Array.isArray(input) ? input : [input];
  return parts.flatMap((part) => splitText(part));
}

// ---------------------------------------------------------------------
// Playing
// ---------------------------------------------------------------------

function speakWithDevice(text, tag = speechTag()) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();

    finishCurrent = resolve;

    utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = tag;
    utterance.rate = 1.05;
    utterance.onend = resolve;
    utterance.onerror = resolve;      // resolve anyway so the UI never sticks

    window.speechSynthesis.speak(utterance);
  });
}

function playClip(src) {
  return new Promise((resolve) => {
    finishCurrent = resolve;

    audio = new Audio(src);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);      // autoplay blocked → resolve, don't hang
  });
}

async function fetchClip(text) {
  const language = getLanguage();
  const key = `${language}|${text}`;

  if (clips.has(key)) return clips.get(key);

  const request = (async () => {
    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language }),
    });

    const data = await response.json();
    if (!response.ok || !data.audio) throw new Error(data.error || 'no audio');

    return `data:${data.mimeType};base64,${data.audio}`;
  })();

  // Keep the cache small: repeated phrases stay, old ones go. A failed
  // request is removed so the next attempt can try again.
  if (clips.size >= CLIP_CACHE_LIMIT) clips.delete(clips.keys().next().value);
  clips.set(key, request);
  request.catch(() => clips.delete(key));

  return request;
}

// Cut the current sound without cancelling the plan that follows.
function silence() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();

  if (audio) {
    audio.pause();
    audio = null;
  }

  // Pausing never fires "ended", so release whoever is waiting on it.
  if (finishCurrent) {
    const release = finishCurrent;
    finishCurrent = null;
    release();
  }
}

/**
 * Get ready to speak. Server audio starts downloading NOW, before play()
 * is called, so a caller can overlap generation with other work.
 *
 *   const voice = speech.prepare('Careful, chair ahead.');
 *   await voice.play(() => stillRelevant());
 *
 * play() takes an optional check that runs once the audio is ready but
 * before it is heard. Walk Mode uses it to drop a warning about an
 * obstacle that has already gone.
 */
export function prepare(input) {
  const pieces = toPieces(input);
  const text = pieces.join(' ');
  const viaServer = !deviceHasVoice();

  const requested = [];
  const piece = (i) => (requested[i] ??= fetchClip(pieces[i]));

  // Begin generating the first piece (and the second, in parallel).
  if (viaServer && pieces.length) {
    piece(0);
    if (pieces.length > 1) piece(1);
  }

  return {
    text,

    async play(stillWanted = () => true) {
      const token = ++playToken;      // supersedes anything already speaking
      silence();
      playing = true;
      lastSpoken = text;

      try {
        for (let i = 0; i < pieces.length; i += 1) {
          if (token !== playToken) return;

          if (!viaServer) {
            await speakWithDevice(pieces[i]);
            continue;
          }

          // Keep one piece ahead of the listener.
          if (i + 2 < pieces.length) piece(i + 2);

          let src;
          try {
            src = await piece(i);
          } catch (error) {
            console.warn('Server speech failed:', error.message);
            if (token === playToken) await speakWithDevice(SPEECH_DOWN, 'en-IN');
            return;
          }

          if (token !== playToken) return;
          if (i === 0 && !stillWanted()) return;

          await playClip(src);
        }
      } finally {
        if (token === playToken) playing = false;
      }
    },
  };
}

export function speak(input) {
  return prepare(input).play();
}

// Cancel whatever is being spoken, by either method.
export function stop() {
  playToken += 1;
  playing = false;
  silence();
}

// Walk Mode and the voice recogniser both ask this, so the app never
// talks over itself or mistakes its own voice for the user's.
export function isSpeaking() {
  return playing;
}

// Used by the "Repeat" feature.
export function getLastSpoken() {
  return lastSpoken;
}

/**
 * Ask the server to generate the phrases we are about to need, so the
 * first warning is as fast as the hundredth. Does nothing when the
 * device speaks the language itself.
 */
export function warm(phrases = []) {
  if (deviceHasVoice()) return;

  // Send the phrases cut into the same pieces the player will request,
  // otherwise the cached audio would never match what is asked for.
  const pieces = phrases.flatMap((phrase) => splitText(phrase));

  fetch('/api/speech/warm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: getLanguage(), phrases: pieces }),
  }).catch(() => { /* warming is only an optimisation */ });
}
