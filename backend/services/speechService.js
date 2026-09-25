// =====================================================================
// speechService.js – text-to-speech for languages the user's device
// cannot speak itself.
//
// English is handled free and offline by the browser. This service is
// used only for Hindi / Marathi / Gujarati, where Windows has no voice
// installed.
//
// A daily request cap protects the free tier: if we run out, the app
// falls back to the browser voice rather than breaking.
// =====================================================================

import { config } from '../config/env.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 15000;
const MAX_TEXT_LENGTH = 600;      // roughly 30 seconds of speech

// ---------- Daily usage cap ----------
// Kept in memory: it resets when the server restarts, which is fine for
// a safety limit. A database would be overkill here.
let usage = { date: '', count: 0 };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function quotaRemaining() {
  if (usage.date !== today()) usage = { date: today(), count: 0 };
  return config.ttsDailyLimit - usage.count;
}

export function usageStats() {
  return { used: usage.date === today() ? usage.count : 0, limit: config.ttsDailyLimit };
}

function userError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

// Turn text into spoken audio. Returns a base64 WAV string.
export async function synthesize(text) {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') {
    throw userError('Speech is not set up on this server.', 503);
  }

  const clean = String(text || '').trim().slice(0, MAX_TEXT_LENGTH);
  if (!clean) throw userError('There was nothing to speak.', 400);

  if (quotaRemaining() <= 0) {
    throw userError('The daily speech limit has been reached.', 429);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${GEMINI_URL}/${config.ttsModel}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: clean }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } },
          },
        },
      }),
    });
  } catch (cause) {
    console.error('[tts] request failed:', cause.name);
    throw userError('The speech service did not respond.', 504);
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[tts]', response.status, data?.error?.message || '');
    throw userError('The speech service is busy. Please try again.', 503);
  }

  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  if (!part?.data) throw userError('The speech service returned no audio.', 502);

  usage.count += 1;     // only count successful calls
  return { audioBase64: part.data, mimeType: part.mimeType || 'audio/wav' };
}
