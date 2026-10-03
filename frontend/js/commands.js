// =====================================================================
// commands.js - turning what the user SAID into which feature to run.
//
// Speech recognition gives us a sentence; this file decides what the
// user meant. Keeping it separate from the recogniser means adding a
// new command, or a new language, is a one-line change here and
// nothing else moves.
//
// Matching is deliberately forgiving: recognition is imperfect, accents
// vary, and a user who cannot see the screen gets no second chance to
// read what went wrong. We match on KEYWORDS appearing anywhere in the
// sentence, not on exact phrases.
// =====================================================================

// Each action lists the words that should trigger it, in every
// language. Order matters: the first action with a match wins, so the
// most specific phrases are listed first.
const COMMANDS = [
  {
    action: 'stop',
    words: [
      'stop', 'quiet', 'silence', 'cancel',
      'रुको', 'बंद', 'चुप',
      'थांब', 'बंद कर', 'गप',
      'બંધ', 'ઊભા રહો', 'ચૂપ',
    ],
  },
  {
    action: 'help',
    words: [
      'help', 'what can you do', 'commands',
      'मदद', 'सहायता',
      'मदत',
      'મદદ',
    ],
  },
  {
    action: 'repeat',
    words: [
      'repeat', 'again', 'say that again', 'pardon',
      'दोहराओ', 'फिर से', 'दुबारा',
      'पुन्हा', 'परत',
      'ફરીથી', 'પુનરાવર્તન',
    ],
  },
  {
    action: 'translate',
    words: [
      'translate', 'meaning', 'what does it mean', 'in marathi', 'in hindi',
      'अनुवाद', 'मतलब', 'अर्थ',
      'भाषांतर', 'अर्थ काय',
      'ભાષાંતર', 'અનુવાદ', 'અર્થ',
    ],
  },
  {
    action: 'read',
    words: [
      'read', 'what does this say', 'text',
      'पढ़', 'लिखा',
      'वाच', 'लिहिले',
      'વાંચ', 'લખ્યું',
    ],
  },
  {
    action: 'walk',
    words: [
      'walk', 'walking', 'guide me', 'obstacle', 'warn me',
      'चलना', 'चल रहा', 'रुकावट',
      'चालण्या', 'चालत', 'अडथळा',
      'ચાલવા', 'ચાલું', 'અવરોધ',
    ],
  },
  {
    action: 'detect',
    words: [
      'detect', 'objects', 'what is in front', 'what is ahead', 'things',
      'वस्तु', 'सामने क्या', 'पहचान',
      'वस्तू', 'समोर काय', 'ओळख',
      'વસ્તુ', 'સામે શું', 'ઓળખ',
    ],
  },
  {
    action: 'describe',
    words: [
      'describe', 'surroundings', 'around me', 'where am i', 'scene', 'look',
      'आसपास', 'बताओ', 'वर्णन', 'चारों ओर',
      'आजूबाजू', 'सांग', 'वर्णन',
      'આસપાસ', 'કહો', 'વર્ણન',
    ],
  },
  {
    action: 'camera',
    words: [
      'camera on', 'camera off', 'turn on camera', 'turn off camera',
      'कैमरा',
      'कॅमेरा',
      'કૅમેરા',
    ],
  },
];

// Switching language by voice, so a user who cannot see the dropdown
// is not stuck in a language they do not speak.
const LANGUAGE_COMMANDS = [
  { code: 'en', words: ['english', 'अंग्रेजी', 'इंग्रजी', 'અંગ્રેજી'] },
  { code: 'hi', words: ['hindi', 'हिंदी', 'हिन्दी'] },
  { code: 'mr', words: ['marathi', 'मराठी'] },
  { code: 'gu', words: ['gujarati', 'ગુજરાતી', 'गुजराती'] },
];

const SWITCH_WORDS = [
  'language', 'speak', 'change to', 'switch to',
  'भाषा', 'बोलो',
  'भाषा बदल', 'बोल',
  'ભાષા', 'બોલો',
];

/**
 * Work out what the user asked for.
 *
 * Returns one of:
 *   { type: 'action',   action: 'read' }
 *   { type: 'language', code: 'mr' }
 *   null  - nothing recognised
 */
export function match(transcript) {
  if (!transcript) return null;

  const text = transcript.toLowerCase().trim();

  // "speak in Marathi" / "मराठीत बोल" - a language name plus a switching
  // word. Requiring both avoids switching language every time someone
  // merely says the word "English" inside another sentence.
  const wantsSwitch = SWITCH_WORDS.some((word) => text.includes(word));

  if (wantsSwitch) {
    const language = LANGUAGE_COMMANDS.find((l) => l.words.some((w) => text.includes(w)));
    if (language) return { type: 'language', code: language.code };
  }

  const command = COMMANDS.find((c) => c.words.some((word) => text.includes(word)));

  return command ? { type: 'action', action: command.action } : null;
}
