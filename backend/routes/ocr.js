// =====================================================================
// POST /api/ocr - read the text in a photo.
//
// TWO engines, tried in order:
//
//   1. Gemini    - accurate on Indian scripts, and the only one of the
//                  two that can read Gujarati at all. Needs internet.
//   2. EasyOCR   - local and offline, used when Gemini is unreachable.
//
// Gemini goes first because of what we measured on the same Marathi
// sign:
//
//   EasyOCR   "परवेशद्वार पुणे सटेशन"     conjuncts broken
//   Gemini    "प्रवेशद्वार पुणे स्टेशन"     exact
//
// Reading text back WRONG is worse than useless here: the person
// listening cannot check it against the page.
// =====================================================================

import { Router } from 'express';
import { readImageText } from '../services/aiService.js';
import { readText as readTextLocally } from '../services/pythonService.js';
import { describeText } from '../services/responseService.js';
import { isSupported, DEFAULT_LANGUAGE } from '../config/languages.js';

const router = Router();

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

router.post('/', async (req, res, next) => {
  try {
    const { image, language } = req.body || {};

    const parsed = parseDataUrl(image);
    if (!parsed) {
      const error = new Error('No picture was received. Please try again.');
      error.status = 400;
      throw error;
    }

    const languageCode = isSupported(language) ? language : DEFAULT_LANGUAGE;

    let result;
    let engine = 'gemini';

    try {
      const text = await readImageText(parsed.base64, parsed.mimeType);
      // Gemini gives no confidence score. It either returns the text or
      // says there was none, so treat a non-empty answer as confident.
      result = { text, confidence: text ? 0.95 : 0 };
    } catch (geminiError) {
      console.warn('[ocr] Gemini unavailable, falling back to EasyOCR:', geminiError.message);
      engine = 'easyocr';
      result = await readTextLocally(parsed.base64, languageCode);
    }

    const { message, read, confidence } = describeText(result, languageCode);

    res.json({ ok: true, message, read, confidence, engine });
  } catch (error) {
    next(error);
  }
});

export default router;
