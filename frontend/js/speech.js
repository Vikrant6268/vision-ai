// =====================================================================
// speech.js – the app's voice (Text-to-Speech).
//
// Uses the browser's built-in SpeechSynthesis API: free, works offline,
// needs no API key. Phase 10 adds Hindi / Marathi / Gujarati on top.
// =====================================================================

let lastSpoken = '';

// Speak `text` aloud. Returns a Promise that resolves when speech ends,
// so callers can `await` it and update the status afterwards.
export function speak(text) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      console.warn('Text-to-speech is not supported in this browser.');
      resolve();
      return;
    }

    stop();                     // never talk over ourselves
    lastSpoken = text;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-IN';
    utterance.rate = 1;
    utterance.onend = resolve;
    utterance.onerror = resolve; // still resolve, so the UI never gets stuck

    window.speechSynthesis.speak(utterance);
  });
}

// Cancel whatever is currently being spoken.
export function stop() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Used by the "Repeat" feature.
export function getLastSpoken() {
  return lastSpoken;
}
