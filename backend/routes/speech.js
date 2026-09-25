// =====================================================================
// POST /api/speech – turn text into audio for non-English languages.
//
// The frontend calls this ONLY when the browser has no voice for the
// selected language. English never reaches this route.
// =====================================================================

import { Router } from 'express';
import { synthesize, usageStats } from '../services/speechService.js';

const router = Router();

router.get('/usage', (req, res) => {
  res.json({ ok: true, ...usageStats() });
});

router.post('/', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    const { audioBase64, mimeType } = await synthesize(text);
    res.json({ ok: true, audio: audioBase64, mimeType, ...usageStats() });
  } catch (error) {
    next(error);
  }
});

export default router;
