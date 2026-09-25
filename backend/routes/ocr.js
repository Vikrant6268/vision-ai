// =====================================================================
// POST /api/ocr - read the text in a photo.
//
//   camera -> Node (here) -> Python/EasyOCR -> spoken sentence
// =====================================================================

import { Router } from 'express';
import { readText } from '../services/pythonService.js';
import { describeText } from '../services/responseService.js';
import { isSupported, DEFAULT_LANGUAGE } from '../config/languages.js';

const router = Router();

function parseDataUrl(dataUrl) {
  const match = /^data:image\/(?:jpeg|png|webp);base64,(.+)$/.exec(dataUrl || '');
  return match ? match[1] : null;
}

router.post('/', async (req, res, next) => {
  try {
    const { image, language } = req.body || {};

    const base64 = parseDataUrl(image);
    if (!base64) {
      const error = new Error('No picture was received. Please try again.');
      error.status = 400;
      throw error;
    }

    const languageCode = isSupported(language) ? language : DEFAULT_LANGUAGE;
    const result = await readText(base64, languageCode);
    const { message, read, confidence } = describeText(result, languageCode);

    res.json({ ok: true, message, read, confidence, blocks: result.blocks });
  } catch (error) {
    next(error);
  }
});

export default router;
