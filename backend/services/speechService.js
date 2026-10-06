// =====================================================================
// speechService.js – text-to-speech for languages the user's device
// cannot speak itself.
//
// English never comes here: the browser speaks it free and offline.
// Hindi, Marathi and Gujarati come here only when the device has no
// voice of its own. (On Android, Chrome already has them, so phones
// skip this service entirely.)
//
// Order of attempts:
//
//   1. disk cache      instant. Short phrases only, see below.
//   2. Edge voices     ~2 s, free, no quota           (edgeTts.js)
//   3. Gemini voices   last resort, 10 requests/day    (geminiTts.js)
//
// WHY A CACHE: most of what the app says is a fixed phrase - "Careful,
// chair ahead", the help text, error messages. Generating "Careful,
// chair ahead" once and replaying the file takes about 20 ms instead of
// 2 s, and it is what makes Walk Mode warnings feel immediate.
//
// Only FIXED phrases are cached - the ones the app itself says (warnings,
// help, error messages), which it announces through warm(). Text that a
// user had read aloud from a document is never stored: keeping a copy of
// whatever someone scanned on the server would be a privacy problem.
// =====================================================================

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { config } from '../config/env.js';
import { isSupported } from '../config/languages.js';
import { speechPhrases } from '../../shared/responseService.js';
import * as edge from './edgeTts.js';
import * as gemini from './geminiTts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(__dirname, '..', '..', config.ttsCacheDir);

export const MAX_TEXT_LENGTH = 600;     // per request; the browser sends pieces
const MAX_PHRASE_LENGTH = 200;          // longest fixed phrase we will warm

const WARM_CONCURRENCY = 3;
const MAX_WARM_PHRASES = 400;

const stats = { cacheHits: 0, edge: 0, gemini: 0, failed: 0 };

// Created on first use, so the service works even if nothing called
// ensureCacheDir() at startup.
let dirReady = null;
function ensureDir() {
  dirReady ??= fs.mkdir(CACHE_DIR, { recursive: true });
  return dirReady;
}

// Identical requests made at the same moment share one synthesis.
const inFlight = new Map();

// Cache keys of phrases the app says itself. Only these are written to
// disk. A phrase becomes "fixed" when warm() is told about it.
const fixedPhrases = new Set();

function userError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

function cacheKey(text, languageCode) {
  return crypto
    .createHash('sha1')
    .update(`${edge.voiceFor(languageCode)}|${text}`)
    .digest('hex');
}

async function readCache(key) {
  try {
    return await fs.readFile(path.join(CACHE_DIR, `${key}.mp3`));
  } catch {
    return null;
  }
}

async function writeCache(key, audio) {
  // Write to a temporary name, then rename: a half-written file must
  // never be served as if it were a complete clip.
  const final = path.join(CACHE_DIR, `${key}.mp3`);
  const temp = `${final}.${crypto.randomUUID()}.part`;
  try {
    await fs.writeFile(temp, audio);
    await fs.rename(temp, final);
  } catch (error) {
    console.warn('[tts] could not cache clip:', error.message);
    fs.unlink(temp).catch(() => {});
  }
}

async function generate(text, languageCode) {
  // Edge twice (its connection occasionally drops), then Gemini.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const audio = await edge.synthesize(text, languageCode, CACHE_DIR);
    if (audio) {
      stats.edge += 1;
      return { audio, mimeType: edge.MIME_TYPE };
    }
  }

  const fallback = await gemini.synthesize(text);
  if (fallback) {
    stats.gemini += 1;
    return fallback;
  }

  stats.failed += 1;
  return null;
}

/**
 * Turn text into spoken audio.
 * Returns { audio: Buffer, mimeType, source: 'cache' | 'live' }.
 */
export async function synthesize(text, languageCode) {
  if (!isSupported(languageCode)) {
    throw userError('That language is not supported for speech.', 400);
  }

  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_LENGTH);
  if (!clean) throw userError('There was nothing to speak.', 400);

  const key = cacheKey(clean, languageCode);

  // Reading is harmless for any text: a file only exists if it was
  // stored as a fixed phrase earlier.
  const cached = await readCache(key);
  if (cached) {
    stats.cacheHits += 1;
    return { audio: cached, mimeType: edge.MIME_TYPE, source: 'cache' };
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const job = (async () => {
    await ensureDir();
    const result = await generate(clean, languageCode);
    if (!result) throw userError('The speech service is busy. Please try again.', 503);

    // Only fixed phrases, and only Edge clips (one format, one voice).
    if (fixedPhrases.has(key) && result.mimeType === edge.MIME_TYPE) {
      await writeCache(key, result.audio);
    }

    return { ...result, source: 'live' };
  })();

  inFlight.set(key, job);
  try {
    return await job;
  } finally {
    inFlight.delete(key);
  }
}

// ---------- Warm-up ----------

const warming = new Set();

/**
 * Generate the phrases the app is going to say, in the background, so
 * the first Walk Mode warning is as fast as the hundredth.
 *
 * `extraPhrases` are the interface strings, which only the browser
 * knows. The alert and detection phrases come from responseService.
 */
export function warm(languageCode, extraPhrases = []) {
  if (!isSupported(languageCode) || languageCode === 'en') {
    return { queued: 0, reason: 'not needed' };
  }

  if (warming.has(languageCode)) return { queued: 0, reason: 'already running' };

  const phrases = [...new Set([...extraPhrases, ...speechPhrases(languageCode)])]
    .map((p) => String(p).replace(/\s+/g, ' ').trim())
    .filter((p) => p && p.length <= MAX_PHRASE_LENGTH)
    .slice(0, MAX_WARM_PHRASES);

  // From now on these exact phrases are stored when generated.
  for (const phrase of phrases) fixedPhrases.add(cacheKey(phrase, languageCode));

  warming.add(languageCode);

  (async () => {
    await ensureDir();

    const queue = [...phrases];
    let generated = 0;

    const worker = async () => {
      while (queue.length) {
        const phrase = queue.shift();
        try {
          const result = await synthesize(phrase, languageCode);
          if (result.source === 'live') generated += 1;
        } catch {
          // A failed phrase is simply generated on demand later.
        }
      }
    };

    await Promise.all(Array.from({ length: WARM_CONCURRENCY }, worker));
    console.log(`[tts] warm-up for ${languageCode} done: ${generated} new, ${phrases.length - generated} already cached`);
  })().finally(() => warming.delete(languageCode));

  return { queued: phrases.length };
}

export function speechStats() {
  return { ...stats, warming: [...warming] };
}
