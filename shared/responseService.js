// =====================================================================
// responseService.js – turns YOLO's raw output into a sentence a person
// can understand, in their own language.
//
//   [{label:"bus", position:"center", area:0.45}, ...]
//        ↓
//   "तुमच्या समोर एक बस आहे."
//
// Translation uses a local dictionary, NOT an API call, so obstacle
// warnings are instant and keep working without internet.
//
// SHARED by the server and the browser. It has no imports and uses no
// Node.js features, so the same file builds sentences on the server (for
// YOLO running in Python) and on the phone (for YOLO running in the
// browser). One source of wording, wherever detection happens.
// =====================================================================

// The COCO classes that actually matter to someone moving around.
// Anything not listed falls back to its English label.
const OBJECTS = {
  person:          { en: 'person',        hi: 'व्यक्ति',        mr: 'व्यक्ती',       gu: 'વ્યક્તિ' },
  bicycle:         { en: 'bicycle',       hi: 'साइकिल',         mr: 'सायकल',        gu: 'સાયકલ' },
  car:             { en: 'car',           hi: 'कार',            mr: 'कार',          gu: 'કાર' },
  motorcycle:      { en: 'motorcycle',    hi: 'मोटरसाइकिल',     mr: 'मोटारसायकल',   gu: 'મોટરસાઇકલ' },
  bus:             { en: 'bus',           hi: 'बस',             mr: 'बस',           gu: 'બસ' },
  truck:           { en: 'truck',         hi: 'ट्रक',           mr: 'ट्रक',         gu: 'ટ્રક' },
  'traffic light': { en: 'traffic light', hi: 'ट्रैफिक लाइट',   mr: 'वाहतूक दिवा',  gu: 'ટ્રાફિક લાઇટ' },
  bench:           { en: 'bench',         hi: 'बेंच',           mr: 'बाक',          gu: 'બેન્ચ' },
  dog:             { en: 'dog',           hi: 'कुत्ता',         mr: 'कुत्रा',       gu: 'કૂતરો' },
  cat:             { en: 'cat',           hi: 'बिल्ली',         mr: 'मांजर',        gu: 'બિલાડી' },
  backpack:        { en: 'bag',           hi: 'बैग',            mr: 'बॅग',          gu: 'બેગ' },
  handbag:         { en: 'handbag',       hi: 'हैंडबैग',        mr: 'हँडबॅग',       gu: 'હેન્ડબેગ' },
  bottle:          { en: 'bottle',        hi: 'बोतल',           mr: 'बाटली',        gu: 'બોટલ' },
  cup:             { en: 'cup',           hi: 'कप',             mr: 'कप',           gu: 'કપ' },
  chair:           { en: 'chair',         hi: 'कुर्सी',         mr: 'खुर्ची',       gu: 'ખુરશી' },
  couch:           { en: 'sofa',          hi: 'सोफा',           mr: 'सोफा',         gu: 'સોફા' },
  bed:             { en: 'bed',           hi: 'बिस्तर',         mr: 'बेड',          gu: 'પલંગ' },
  'dining table':  { en: 'table',         hi: 'मेज',            mr: 'टेबल',         gu: 'ટેબલ' },
  tv:              { en: 'television',    hi: 'टीवी',           mr: 'टीव्ही',       gu: 'ટીવી' },
  laptop:          { en: 'laptop',        hi: 'लैपटॉप',         mr: 'लॅपटॉप',       gu: 'લેપટોપ' },
  keyboard:        { en: 'keyboard',      hi: 'कीबोर्ड',        mr: 'कीबोर्ड',      gu: 'કીબોર્ડ' },
  'cell phone':    { en: 'mobile phone',  hi: 'मोबाइल',         mr: 'मोबाइल',       gu: 'મોબાઇલ' },
  book:            { en: 'book',          hi: 'किताब',          mr: 'पुस्तक',       gu: 'પુસ્તક' },
  clock:           { en: 'clock',         hi: 'घड़ी',           mr: 'घड्याळ',       gu: 'ઘડિયાળ' },
  refrigerator:    { en: 'fridge',        hi: 'फ्रिज',          mr: 'फ्रिज',        gu: 'ફ્રિજ' },
  'potted plant':  { en: 'plant',         hi: 'पौधा',           mr: 'रोप',          gu: 'છોડ' },
};

const NUMBERS = {
  en: ['', 'one', 'two', 'three', 'four', 'five'],
  hi: ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच'],
  mr: ['', 'एक', 'दोन', 'तीन', 'चार', 'पाच'],
  gu: ['', 'એક', 'બે', 'ત્રણ', 'ચાર', 'પાંચ'],
};

const POSITIONS = {
  en: { left: 'on your left',    center: 'in front of you', right: 'on your right' },
  hi: { left: 'आपकी बाईं ओर',    center: 'आपके सामने',      right: 'आपकी दाईं ओर' },
  mr: { left: 'तुमच्या डावीकडे', center: 'तुमच्या समोर',     right: 'तुमच्या उजवीकडे' },
  gu: { left: 'તમારી ડાબી બાજુ', center: 'તમારી સામે',      right: 'તમારી જમણી બાજુ' },
};

const PHRASES = {
  en: {
    nothing: 'I cannot see anything clearly. Please move the camera slowly.',
    warning: 'Careful.',
    verbOne: 'There is',
    verbMany: 'There are',
  },
  hi: {
    nothing: 'मुझे कुछ साफ़ नहीं दिख रहा। कृपया कैमरा धीरे घुमाएँ।',
    warning: 'सावधान।',
    verbOne: 'है।',
    verbMany: 'हैं।',
  },
  mr: {
    nothing: 'मला काही स्पष्ट दिसत नाही. कृपया कॅमेरा हळू फिरवा.',
    warning: 'सावधान.',
    verbOne: 'आहे.',
    verbMany: 'आहेत.',
  },
  gu: {
    nothing: 'મને કંઈ સ્પષ્ટ દેખાતું નથી. કૃપા કરીને કૅમેરા ધીમે ફેરવો.',
    warning: 'સાવધાન.',
    verbOne: 'છે.',
    verbMany: 'છે.',
  },
};

// An object filling this much of the frame, directly ahead, is close
// enough to be worth a warning. We say WHAT and WHERE, never a
// distance, because a single camera cannot measure distance.
//
// Tuned down from 0.20 to 0.10 after real-world testing: warnings at
// 0.20 arrived too late to be useful while actually walking.
const OBSTACLE_AREA = 0.10;

// Two things is about as much as a listener can hold at once, and every
// extra item adds seconds of speech. Describe Scene gives the full picture.
const MAX_SPOKEN = 2;

// English needs plurals ("two people"); Hindi, Marathi and Gujarati read
// naturally with the base word after a number ("दोन व्यक्ती").
const ENGLISH_PLURALS = { person: 'people' };

function name(label, lang, n) {
  const entry = OBJECTS[label];
  const word = entry?.[lang] ?? entry?.en ?? label;

  if (lang !== 'en' || n === 1) return word;

  return ENGLISH_PLURALS[label] ?? (/(s|x|ch|sh)$/.test(word) ? `${word}es` : `${word}s`);
}

// English sounds better with "a chair" than "one chair"; the Indian
// languages use the number word in both cases.
function count(n, lang) {
  if (lang === 'en') {
    if (n > 1) return NUMBERS.en[n] ?? String(n);
    return null;                 // caller uses the article instead
  }
  return NUMBERS[lang]?.[n] ?? String(n);
}

function article(word) {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

// Short, urgent phrasing for Walk Mode. A full sentence takes too long
// to speak when someone is moving toward something.
// Said when the view is blocked - we know something is there, but not
// what it is, so we tell the user to stop rather than guess.
const BLOCKED_ALERT = {
  en: 'Stop. Something is right in front of you.',
  hi: 'रुकिए। आपके ठीक सामने कुछ है।',
  mr: 'थांबा. तुमच्या अगदी समोर काहीतरी आहे.',
  gu: 'ઊભા રહો. તમારી બરાબર સામે કંઈક છે.',
};

// Said when the camera cannot see at all. Telling the user the real
// problem lets them fix it; a vague warning does not.
const TOO_DARK_ALERT = {
  en: 'It is too dark to see. Please turn on a light.',
  hi: 'देखने के लिए बहुत अंधेरा है। कृपया रोशनी चालू करें।',
  mr: 'पाहण्यासाठी खूप अंधार आहे. कृपया दिवा लावा.',
  gu: 'જોવા માટે ખૂબ અંધારું છે. કૃપા કરીને લાઇટ ચાલુ કરો.',
};

const ALERTS = {
  en: { left: 'Careful, {obj} on your left.',    center: 'Careful, {obj} ahead.',    right: 'Careful, {obj} on your right.' },
  hi: { left: 'सावधान, बाईं ओर {obj}।',          center: 'सावधान, सामने {obj}।',      right: 'सावधान, दाईं ओर {obj}।' },
  mr: { left: 'सावधान, डावीकडे {obj}.',          center: 'सावधान, समोर {obj}.',       right: 'सावधान, उजवीकडे {obj}.' },
  gu: { left: 'સાવધાન, ડાબી બાજુ {obj}.',        center: 'સાવધાન, સામે {obj}.',       right: 'સાવધાન, જમણી બાજુ {obj}.' },
};

// The text of one Walk Mode warning. Both buildAlert() and the speech
// warm-up call this, so the phrase that gets cached is byte-for-byte the
// phrase that gets spoken.
function alertText(label, position, lang) {
  const template = (ALERTS[lang] ?? ALERTS.en)[position];
  return template.replace('{obj}', name(label, lang, 1));
}

// One detection as its own short sentence: "There are two people on your
// left." Separate sentences let the browser fetch and replay each one
// independently, and common ones are already cached.
function detectionSentence(label, n, position, lang) {
  const phrases = PHRASES[lang] ?? PHRASES.en;
  const positions = POSITIONS[lang] ?? POSITIONS.en;
  const word = name(label, lang, n);
  const quantity = count(n, lang) ?? article(word);
  const where = positions[position];

  // English puts the verb first; Hindi, Marathi and Gujarati put it last.
  if (lang === 'en') {
    const verb = n > 1 ? phrases.verbMany : phrases.verbOne;
    return `${verb} ${quantity} ${word} ${where}.`;
  }

  const verb = n > 1 ? phrases.verbMany : phrases.verbOne;
  return `${quantity} ${word} ${where} ${verb}`;
}

/**
 * Walk Mode: return a short warning, or null when nothing needs saying.
 *
 * Only objects that are BOTH large (close) and in the user's path get
 * announced. Everything else stays silent - constant chatter would make
 * the app unusable while walking.
 *
 * Returns { alert, key } where `key` identifies the thing being warned
 * about, so the caller can avoid repeating the same warning.
 */
export function buildAlert(objects, lang = 'en', viewBlocked = false, tooDark = false) {
  // Darkness first: if the camera cannot see, no other warning we give
  // would be trustworthy.
  if (tooDark) {
    return { alert: TOO_DARK_ALERT[lang] ?? TOO_DARK_ALERT.en, key: 'dark' };
  }

  // A blocked view is the most urgent case AND the one YOLO cannot see,
  // so it is checked next and overrides any object warning.
  if (viewBlocked) {
    return { alert: BLOCKED_ALERT[lang] ?? BLOCKED_ALERT.en, key: 'blocked' };
  }

  if (!objects || objects.length === 0) return null;

  // Objects directly ahead matter most; something large to the side is
  // worth a mention only if it is very large.
  const candidate = objects.find(
    (o) => (o.position === 'center' && o.area >= OBSTACLE_AREA)
        || (o.position !== 'center' && o.area >= OBSTACLE_AREA * 2),
  );

  if (!candidate) return null;

  return {
    alert: alertText(candidate.label, candidate.position, lang),
    key: `${candidate.label}|${candidate.position}`,
  };
}

// Spoken wrappers for the OCR result.
const READING = {
  en: { prefix: 'The text says:',
        unreadable: 'I could not read the text clearly. Please hold the camera closer and steady.' },
  hi: { prefix: 'लिखा है:',
        unreadable: 'मैं लिखा हुआ साफ़ नहीं पढ़ पाया। कृपया कैमरा पास और स्थिर रखें।' },
  mr: { prefix: 'यावर लिहिले आहे:',
        unreadable: 'मला मजकूर स्पष्ट वाचता आला नाही. कृपया कॅमेरा जवळ आणि स्थिर धरा.' },
  gu: { prefix: 'લખ્યું છે:',
        unreadable: 'હું લખાણ સ્પષ્ટ વાંચી શક્યો નહીં. કૃપા કરીને કૅમેરા નજીક અને સ્થિર રાખો.' },
};

// Said when we give the MEANING rather than the printed words, so the
// user always knows which of the two they are hearing.
const TRANSLATION = {
  en: { prefix: 'Translated, it says:' },
  hi: { prefix: 'इसका अर्थ है:' },
  mr: { prefix: 'याचा अर्थ आहे:' },
  gu: { prefix: 'આનો અર્થ છે:' },
};

// Said when the page needed translating but translation failed (no
// internet, or the AI service is down). The listener still hears the
// text, but is told plainly that it is NOT in their language.
const UNTRANSLATED = {
  en: { prefix: 'I could not translate this. As printed, it says:' },
  hi: { prefix: 'अनुवाद नहीं हो सका। जैसा लिखा है:' },
  mr: { prefix: 'भाषांतर करता आले नाही. जसे लिहिले आहे:' },
  gu: { prefix: 'ભાષાંતર થઈ શક્યું નહીં. જેમ લખ્યું છે:' },
};

// Below this the reading is probably wrong, and reading nonsense aloud
// to someone who cannot check it is worse than admitting failure.
const MIN_READ_CONFIDENCE = 0.45;

/**
 * Turn an OCR result into something worth speaking.
 */
export function describeText({ text, confidence }, lang = 'en', mode = 'same') {
  // 'same'         the page is in the user's language: the printed words
  // 'translated'   the page was translated into the user's language
  // 'untranslated' it needed translating, but translation failed
  const reading = READING[lang] ?? READING.en;

  if (!text || confidence < MIN_READ_CONFIDENCE) {
    return { message: reading.unreadable, segments: [reading.unreadable], read: false };
  }

  const prefixes = { same: READING, translated: TRANSLATION, untranslated: UNTRANSLATED };
  const phrases = (prefixes[mode] ?? READING)[lang] ?? READING.en;

  // The prefix is its own segment: it is a fixed phrase, already cached,
  // so the listener hears it at once while the text itself is generated.
  return {
    message: `${phrases.prefix} ${text}`,
    segments: [phrases.prefix, text],
    read: true,
    confidence,
  };
}

/**
 * Build the spoken sentence for a set of detections.
 *
 * Returns { message, warning }. `warning` is true when something large
 * is directly ahead, so the caller can choose to interrupt the user.
 */
export function describeDetections(objects, lang = 'en') {
  const phrases = PHRASES[lang] ?? PHRASES.en;

  if (!objects || objects.length === 0) {
    return { message: phrases.nothing, segments: [phrases.nothing], warning: false };
  }

  // Group identical labels sharing a position: "two people on your left".
  const groups = new Map();

  for (const object of objects.slice(0, 6)) {
    const key = `${object.label}|${object.position}`;
    const existing = groups.get(key);

    if (existing) {
      existing.n += 1;
      existing.area = Math.max(existing.area, object.area);
    } else {
      groups.set(key, { ...object, n: 1 });
    }
  }

  const ordered = [...groups.values()]
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_SPOKEN);

  const blocking = ordered.find(
    (g) => g.position === 'center' && g.area >= OBSTACLE_AREA,
  );

  const segments = ordered.map((g) => detectionSentence(g.label, g.n, g.position, lang));
  if (blocking) segments.unshift(phrases.warning);

  return {
    message: segments.join(' '),
    segments,
    warning: Boolean(blocking),
  };
}

/**
 * Every fixed phrase this file can say in a language.
 *
 * Used to pre-generate speech in the background, so that the first
 * warning of a walk is as fast as the hundredth. The strings come from
 * the same builders that produce live responses, so they match exactly.
 */
export function speechPhrases(lang) {
  const phrases = PHRASES[lang];
  if (!phrases) return [];

  const list = [
    phrases.nothing,
    phrases.warning,
    BLOCKED_ALERT[lang],
    TOO_DARK_ALERT[lang],
    READING[lang].prefix,
    READING[lang].unreadable,
    TRANSLATION[lang].prefix,
    UNTRANSLATED[lang].prefix,
  ];

  for (const label of Object.keys(OBJECTS)) {
    for (const position of ['left', 'center', 'right']) {
      list.push(alertText(label, position, lang));
      list.push(detectionSentence(label, 1, position, lang));
    }
  }

  return list.filter(Boolean);
}
