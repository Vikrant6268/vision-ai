// =====================================================================
// POST /api/vision/describe
//
// Receives a photo from the browser, asks Gemini what is in it, and
// returns one spoken-ready sentence.
//
//   camera.js  ──(base64 jpeg)──►  this route  ──►  aiService  ──►  Gemini
// =====================================================================

import { Router } from 'express';
import { describeImage } from '../services/aiService.js';
import { detectObjects } from '../services/pythonService.js';
import { describeDetections, buildAlert } from '../services/responseService.js';
import { isSupported, DEFAULT_LANGUAGE, LANGUAGES } from '../config/languages.js';

const router = Router();

const MAX_IMAGE_BYTES = 6 * 1024 * 1024;   // ~6 MB of decoded image

// Browsers send "data:image/jpeg;base64,/9j/4AA..." – split off the header.
function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

// List the supported languages so the frontend never hard-codes them.
router.get('/languages', (req, res) => {
  res.json({
    ok: true,
    languages: Object.entries(LANGUAGES).map(([code, { label }]) => ({ code, label })),
  });
});

router.post('/describe', async (req, res, next) => {
  try {
    const { image, language } = req.body || {};

    const parsed = parseDataUrl(image);
    if (!parsed) {
      const error = new Error('No picture was received. Please try again.');
      error.status = 400;
      throw error;
    }

    // base64 is ~4/3 the size of the raw bytes.
    if (parsed.base64.length * 0.75 > MAX_IMAGE_BYTES) {
      const error = new Error('That picture is too large. Please try again.');
      error.status = 413;
      throw error;
    }

    const languageCode = isSupported(language) ? language : DEFAULT_LANGUAGE;
    const message = await describeImage(parsed.base64, parsed.mimeType, languageCode);

    res.json({ ok: true, message, language: languageCode });
  } catch (error) {
    next(error);   // handled by middleware/errorHandler.js
  }
});

router.post('/detect', async (req, res, next) => {
  try {
    const { image, language } = req.body || {};

    const parsed = parseDataUrl(image);
    if (!parsed) {
      const error = new Error('No picture was received. Please try again.');
      error.status = 400;
      throw error;
    }

    const languageCode = isSupported(language) ? language : DEFAULT_LANGUAGE;
    const result = await detectObjects(parsed.base64);
    const { message, warning } = describeDetections(result.objects, languageCode);

    // Walk Mode needs a short urgent phrase instead of a full sentence.
    const alert = buildAlert(result.objects, languageCode, result.viewBlocked, result.tooDark);

    res.json({
      ok: true,
      message,
      warning,
      alert: alert?.alert ?? null,
      alertKey: alert?.key ?? null,
      count: result.count,
      device: result.device,
      viewBlocked: result.viewBlocked,
      tooDark: result.tooDark,
      objects: result.objects,   // raw data, useful for debugging and the viva
    });
  } catch (error) {
    next(error);
  }
});

export default router;
