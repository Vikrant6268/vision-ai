// =====================================================================
// /api/speech – spoken audio for languages the device cannot speak.
//
//   POST /api/speech        { text, language }      → audio
//   POST /api/speech/warm   { language, phrases[] } → start caching
//   GET  /api/speech/stats                          → counters
//
// English never reaches this route: the browser speaks it itself.
// =====================================================================

import { Router } from 'express';
import rateLimit from 'express-rate-limit';

import { synthesize, warm, speechStats } from '../services/speechService.js';
import { isSupported, DEFAULT_LANGUAGE } from '../config/languages.js';

const router = Router();

// This route turns text into audio through an outside service, so it
// must not be usable as a free speech engine by anyone who finds it.
// A real user needs a few requests per minute, a long page maybe 30.
router.use(rateLimit({
  windowMs: 60 * 1000,
  limit: 180,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many speech requests. Please wait a moment.' },
}));

router.get('/stats', (req, res) => {
  res.json({ ok: true, ...speechStats() });
});

router.post('/', async (req, res, next) => {
  try {
    const { text, language } = req.body || {};
    const languageCode = isSupported(language) ? language : DEFAULT_LANGUAGE;

    const { audio, mimeType, source } = await synthesize(text, languageCode);

    res.json({ ok: true, audio: audio.toString('base64'), mimeType, source });
  } catch (error) {
    next(error);
  }
});

router.post('/warm', (req, res) => {
  const { language, phrases } = req.body || {};

  if (!isSupported(language)) {
    return res.status(400).json({ ok: false, error: 'That language is not supported.' });
  }

  const extra = Array.isArray(phrases)
    ? phrases.filter((p) => typeof p === 'string').slice(0, 200)
    : [];

  // Runs in the background; the browser does not wait for it.
  res.json({ ok: true, ...warm(language, extra) });
});

export default router;
