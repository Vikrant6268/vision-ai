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
    name: 'English',
    // Told to Gemini so it replies directly in the target language.
    instruction: 'Reply in English.',
    // Neural voice used by the server when the device has none.
    voice: 'en-IN-NeerjaNeural',
    speechLocale: 'en-IN',
  },
  hi: {
    label: 'हिंदी (Hindi)',
    name: 'Hindi',
    instruction: 'Reply in Hindi (Devanagari script). Do not use English words.',
    voice: 'hi-IN-SwaraNeural',
    speechLocale: 'hi-IN',
  },
  mr: {
    label: 'मराठी (Marathi)',
    name: 'Marathi',
    instruction: 'Reply in Marathi (Devanagari script). Do not use English or Hindi words.',
    voice: 'mr-IN-AarohiNeural',
    speechLocale: 'mr-IN',
  },
  gu: {
    label: 'ગુજરાતી (Gujarati)',
    name: 'Gujarati',
    instruction: 'Reply in Gujarati script. Do not use English or Hindi words.',
    voice: 'gu-IN-DhwaniNeural',
    speechLocale: 'gu-IN',
  },
};

export const DEFAULT_LANGUAGE = 'en';

export function isSupported(code) {
  return Object.hasOwn(LANGUAGES, code);
}

export function getLanguage(code) {
  return LANGUAGES[isSupported(code) ? code : DEFAULT_LANGUAGE];
}
