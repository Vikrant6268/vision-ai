// =====================================================================
// languageDetect.js – which language is a piece of text in?
//
// Read Text uses this to decide whether a page needs translating. We
// work it out ourselves rather than asking the AI, because in testing
// the AI mislabelled translated Marathi as "already Marathi" and told
// the listener they were hearing the printed words.
//
// Method: count the letters of each script.
//
//   Latin        → English
//   Gujarati     → Gujarati
//   Devanagari   → Hindi or Marathi. Both use the same script, so we
//                  look for common words that only one of them uses
//                  (Marathi "आहे", "आणि", "-ण्या", the letter "ळ"; Hindi "है",
//                  "और", "में"). If neither wins, the text is plain
//                  Devanagari - a name or a short sign - which a Hindi
//                  or a Marathi speaker can understand as it is.
//
// No library, no network, no cost - and simple enough to explain.
// =====================================================================

const LATIN = /[A-Za-z]/g;
const DEVANAGARI = /[ऀ-ॿ]/g;     // Hindi and Marathi
const GUJARATI = /[઀-૿]/g;

// Words and letters common in one language and rare in the other.
const MARATHI_HINTS = [
  'आहे', 'आहेत', 'आणि', 'नाही', 'च्या', 'मध्ये', 'होते', 'ळ', 'करा',
  'ण्या',     // पडण्याचा, करण्यासाठी - a Marathi verb ending
  'कडे',      // डावीकडे, उजवीकडे - "towards"
];
const HINDI_HINTS = [' है', ' हैं', ' और ', ' नहीं', ' में ', ' का ', ' की ', ' के ', ' से ', ' यह '];

function countMatches(text, pattern) {
  return (text.match(pattern) || []).length;
}

function countHints(text, hints) {
  const padded = ` ${text} `;
  return hints.reduce((total, hint) => total + padded.split(hint).length - 1, 0);
}

/**
 * Returns 'en' | 'hi' | 'mr' | 'gu' | 'deva' | 'other'.
 *
 * 'deva' means Devanagari that could be either Hindi or Marathi.
 */
export function detectLanguage(text) {
  const value = String(text || '');

  const latin = countMatches(value, LATIN);
  const deva = countMatches(value, DEVANAGARI);
  const guj = countMatches(value, GUJARATI);
  const total = latin + deva + guj;

  if (total === 0) return 'other';

  // Whichever script has the majority of the letters. A Marathi
  // translation may still contain "Platform 3" or a brand name.
  if (guj / total > 0.5) return 'gu';
  if (latin / total > 0.5) return 'en';

  if (deva / total > 0.5) {
    const marathi = countHints(value, MARATHI_HINTS);
    const hindi = countHints(value, HINDI_HINTS);

    if (marathi > hindi) return 'mr';
    if (hindi > marathi) return 'hi';
    return 'deva';
  }

  return 'other';
}

/**
 * Can a speaker of `target` understand this text as it is?
 */
export function isInLanguage(text, target) {
  const detected = detectLanguage(text);

  if (detected === target) return true;

  // Ambiguous Devanagari is fine for both Hindi and Marathi speakers.
  return detected === 'deva' && (target === 'hi' || target === 'mr');
}
