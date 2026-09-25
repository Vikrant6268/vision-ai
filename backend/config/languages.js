// =====================================================================
// languages.js – SERVER-side language configuration.
//
// One entry per supported language. To add a language later (Tamil,
// Bengali, ...), add one object here – no other backend file changes.
//
// The frontend has its own small language file for on-screen text and
// the text-to-speech voice tag; this file only controls what we ASK
// Gemini for. Keeping them separate means the interface can speak to
// the user even when the network is down.
// =====================================================================

export const LANGUAGES = {
  en: {
    label: 'English',
    // Told to Gemini so it replies directly in the target language.
    instruction: 'Reply in English.',
  },
  hi: {
    label: 'हिंदी (Hindi)',
    instruction: 'Reply in Hindi (Devanagari script). Do not use English words.',
  },
  mr: {
    label: 'मराठी (Marathi)',
    instruction: 'Reply in Marathi (Devanagari script). Do not use English or Hindi words.',
  },
  gu: {
    label: 'ગુજરાતી (Gujarati)',
    instruction: 'Reply in Gujarati script. Do not use English or Hindi words.',
  },
};

export const DEFAULT_LANGUAGE = 'en';

export function isSupported(code) {
  return Object.hasOwn(LANGUAGES, code);
}

export function getLanguage(code) {
  return LANGUAGES[isSupported(code) ? code : DEFAULT_LANGUAGE];
}
