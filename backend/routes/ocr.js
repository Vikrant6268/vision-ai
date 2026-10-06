// =====================================================================
// POST /api/ocr - read the text in a photo, in the user's language.
//
// Whatever language the page is in, the user hears it in the language
// they selected. Four steps, each doing one job:
//
//   1. READ        the exact printed words
//                  Gemini first; EasyOCR offline if Gemini is unavailable
//   2. DETECT      which language those words are in
//                  (languageDetect.js - worked out by us, not the AI)
//   3. TRANSLATE   only if that is not the user's language
//   4. CHECK       the translation really is in the user's language
//                  (inside translateText)
//
// Why separate steps: the first version asked the AI to "read and
// translate" in one go. On a real camera photo that sometimes returned
// the English untouched, and when the AI was slow the app fell back to
// offline OCR - which cannot translate - without saying so. Now the
// app itself decides whether translation is needed, and translation
// happens even when the text was read offline.
//
// The spoken prefix always tells the listener what they are hearing:
//
//   same language    "यावर लिहिले आहे: ..."         the printed words
//   translated       "याचा अर्थ आहे: ..."           a translation
//   couldn't         "भाषांतर करता आले नाही ..."    printed words, NOT translated
// =====================================================================

import { Router } from 'express';
import { readImageText, translateText } from '../services/aiService.js';
import { readText as readTextLocally } from '../services/pythonService.js';
import { describeText } from '../../shared/responseService.js';
import { detectLanguage, isInLanguage } from '../services/languageDetect.js';
import { isSupported, DEFAULT_LANGUAGE } from '../config/languages.js';

const router = Router();

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl || '');
  return match ? { mimeType: match[1], base64: match[2] } : null;
}

// Step 1. Returns { text, confidence, engine }.
async function readPage(parsed, languageCode) {
  try {
    const text = await readImageText(parsed.base64, parsed.mimeType);
    // Gemini gives no confidence score: an answer is either text or none.
    return { text, confidence: text ? 0.95 : 0, engine: 'gemini' };
  } catch (error) {
    console.warn('[ocr] Gemini could not read the page, using offline OCR:', error.message);
    const local = await readTextLocally(parsed.base64, languageCode);
    return { ...local, engine: 'easyocr' };
  }
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

    // 1. READ
    const page = await readPage(parsed, languageCode);

    // 2. DETECT
    const pageLanguage = page.text ? detectLanguage(page.text) : null;

    // 3 + 4. TRANSLATE and CHECK - only when the page is not already
    // something the user can understand.
    let spokenText = page.text;
    let mode = 'same';

    if (page.text && !isInLanguage(page.text, languageCode)) {
      try {
        spokenText = await translateText(page.text, languageCode);
        mode = 'translated';
      } catch (error) {
        console.warn('[ocr] translation failed:', error.message);
        mode = 'untranslated';
      }
    }

    console.log(`[ocr] engine=${page.engine} page=${pageLanguage} user=${languageCode} → ${mode}`);

    const spoken = describeText({ text: spokenText, confidence: page.confidence }, languageCode, mode);

    res.json({
      ok: true,
      message: spoken.message,
      segments: spoken.segments,
      read: spoken.read,
      confidence: spoken.confidence,
      translated: mode === 'translated',
      mode,
      pageLanguage,
      engine: page.engine,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
