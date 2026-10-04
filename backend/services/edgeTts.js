// =====================================================================
// edgeTts.js – speech from Microsoft Edge's neural voices.
//
// This is the PRIMARY voice for Hindi, Marathi and Gujarati when the
// user's device has none of its own. Why it was chosen:
//
//   - no account, no API key, no quota
//   - neural voices for all four of our languages
//   - about 1.5-2.5 s for a sentence, and 9 s for a 440-character
//     page. Gemini TTS took 3.6 s and 133 s for the same two texts.
//
// Honest caveat: this uses the same online service as Edge's "Read
// Aloud" feature. It is not a documented public API, so Microsoft could
// change or restrict it. That is why speechService.js keeps Gemini as a
// fallback and the browser's own voice is preferred whenever it exists.
// For a commercial product the supported route is Azure Speech.
// =====================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { EdgeTTS } from 'node-edge-tts';

import { getLanguage } from '../config/languages.js';

const TIMEOUT_MS = 20000;

// Slightly faster than default. People who rely on speech tend to prefer
// it, and it shortens every response.
const RATE = '+10%';

export const MIME_TYPE = 'audio/mpeg';

/**
 * Turn text into an MP3 buffer, or return null if the service failed.
 *
 * `workDir` is where the library writes its temporary file (it can only
 * write to disk, not to memory).
 */
export async function synthesize(text, languageCode, workDir) {
  const language = getLanguage(languageCode);

  const tts = new EdgeTTS({
    voice: language.voice,
    lang: language.speechLocale,
    rate: RATE,
    timeout: TIMEOUT_MS,
  });

  // A unique name per call: several chunks are synthesised in parallel.
  const file = path.join(workDir, `tmp-${crypto.randomUUID()}.mp3`);

  try {
    await tts.ttsPromise(text, file);
    const audio = await fs.readFile(file);
    return audio.length > 0 ? audio : null;
  } catch (cause) {
    // The library rejects with a plain string on a timeout.
    console.error('[edge-tts] failed:', cause?.message || cause);
    return null;
  } finally {
    fs.unlink(file).catch(() => {});
  }
}

export function voiceFor(languageCode) {
  return getLanguage(languageCode).voice;
}
