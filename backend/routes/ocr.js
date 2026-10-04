// =====================================================================
// POST /api/ocr - read the text in a photo, in the user's language.
//
// ONE feature, not two: whatever language the page is in, the user
// hears it in the language they selected. If the page is already in
// that language they hear the printed words; if not, they hear a
// translation. The spoken prefix says which, so nobody mistakes a
// translation for the original wording:
//
//   same language    "यावर लिहिले आहे: ..."   (it is written here)
//   translated       "याचा अर्थ आहे: ..."     (its meaning is)
//
// TWO engines, tried in order:
//
//   1. Gemini    - accurate on Indian scripts, reads Gujarati, and is
//                  the only one that can translate. Needs internet.
//   2. EasyOCR   - local and offline. Reads only; it cannot translate.
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
    let translated = false;
    let engine = 'gemini';

    try {
      const read = await readImageText(parsed.base64, parsed.mimeType, languageCode);
      translated = read.translated;

      // Gemini gives no confidence score. It either returns the text or
      // says there was none, so treat a non-empty answer as confident.
      result = { text: read.text, confidence: read.text ? 0.95 : 0 };
    } catch (geminiError) {
      console.warn('[ocr] Gemini unavailable, using offline OCR:', geminiError.message);

      // Offline we can still read, just not translate.
      engine = 'easyocr';
      result = await readTextLocally(parsed.base64, languageCode);
    }

    const spoken = describeText(result, languageCode, translated);

    res.json({
      ok: true,
      message: spoken.message,
      segments: spoken.segments,
      read: spoken.read,
      confidence: spoken.confidence,
      translated,
      engine,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
