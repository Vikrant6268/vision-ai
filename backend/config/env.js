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
  dbPath:       process.env.DB_PATH || './data/vision_ai.db',
};

// Warn (don't crash) about missing optional keys, so the app still runs
// for features that don't need them.
if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') {
  console.warn('[config] GEMINI_API_KEY not set – scene description will be unavailable.');
}
