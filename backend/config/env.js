// =====================================================================
// env.js – loads .env and exposes settings in ONE place.
// Every other file imports `config` from here instead of reading
// process.env directly, so it's obvious what settings exist.
// =====================================================================

import 'dotenv/config';

export const config = {
  env:          process.env.NODE_ENV || 'development',
  port:         Number(process.env.PORT) || 3000,
  pythonAiUrl:  process.env.PYTHON_AI_URL || 'http://127.0.0.1:8000',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel:  process.env.GEMINI_MODEL || 'gemini-flash-lite-latest',
  geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash-lite',
  ttsModel:     process.env.TTS_MODEL || 'gemini-3.8-flash-lite-tts',
  ttsFallbackModel: process.env.TTS_FALLBACK_MODEL || 'gemini-3.1-flash-tts-preview',
  ttsVoice:     process.env.TTS_VOICE || 'Kore',
  ttsCacheDir:  process.env.TTS_CACHE_DIR || 'data/tts-cache',
  dbPath:       process.env.DB_PATH || './data/vision_ai.db',
};

// Warn (don't crash) about missing optional keys, so the app still runs
// for features that don't need them.
if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') {
  console.warn('[config] GEMINI_API_KEY not set – scene description will be unavailable.');
}
