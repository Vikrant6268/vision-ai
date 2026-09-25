// =====================================================================
// speech.js – the app's voice.
//
// HYBRID approach, chosen because Windows has no Marathi/Hindi/Gujarati
// voice installed:
//
//   English  → browser SpeechSynthesis. Free, instant, works offline.
//   Others   → /api/speech (Gemini TTS), returned as audio and played.
//
// If the server call fails for any reason we fall back to the browser
// voice: bad pronunciation is still better than silence for someone who
// cannot read the screen.
// =====================================================================

import { speechTag, getLanguage } from './languages.js';

let lastSpoken = '';
let audio = null;          // the <audio> element currently playing
let cache = new Map();     // language+text → audio data URL, saves API calls

const CACHE_LIMIT = 30;

// ---------------------------------------------------------------------
// Browser voice (English, and fallback for everything else)
// ---------------------------------------------------------------------
function speakWithBrowser(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechTag();
    utterance.rate = 1;
    utterance.onend = resolve;
    utterance.onerror = resolve;     // resolve anyway so the UI never sticks

    window.speechSynthesis.speak(utterance);
  });
}

// ---------------------------------------------------------------------
// Server voice (Hindi / Marathi / Gujarati)
// ---------------------------------------------------------------------
function playAudio(src) {
  return new Promise((resolve) => {
    audio = new Audio(src);
    audio.onended = resolve;
    audio.onerror = resolve;
    audio.play().catch(resolve);     // autoplay block → resolve, don't hang
  });
}

async function speakWithServer(text) {
  const key = getLanguage() + '|' + text;

  if (cache.has(key)) return playAudio(cache.get(key));

  const response = await fetch('/api/speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();
  if (!response.ok || !data.audio) throw new Error(data.error || 'no audio');

  const src = `data:${data.mimeType};base64,${data.audio}`;

  // Keep the cache small: repeated phrases (help, errors) stay, old ones go.
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value);
  cache.set(key, src);

  return playAudio(src);
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------
export async function speak(text) {
  stop();                 // never talk over ourselves
  lastSpoken = text;

  if (getLanguage() === 'en') return speakWithBrowser(text);

  try {
    await speakWithServer(text);
  } catch (error) {
    console.warn('Server speech failed, using browser voice:', error.message);
    await speakWithBrowser(text);
  }
}

// Cancel whatever is being spoken, by either method.
export function stop() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (audio) {
    audio.pause();
    audio = null;
  }
}

// Walk Mode checks this so it never starts a new alert mid-sentence.
export function isSpeaking() {
  if (audio && !audio.paused && !audio.ended) return true;
  return 'speechSynthesis' in window && window.speechSynthesis.speaking;
}

// Used by the "Repeat" feature.
export function getLastSpoken() {
  return lastSpoken;
}
