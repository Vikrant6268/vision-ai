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
    verb: 'There is',
  },
  hi: {
    nothing: 'मुझे कुछ साफ़ नहीं दिख रहा। कृपया कैमरा धीरे घुमाएँ।',
    warning: 'सावधान।',
    verb: 'है।',
  },
  mr: {
    nothing: 'मला काही स्पष्ट दिसत नाही. कृपया कॅमेरा हळू फिरवा.',
    warning: 'सावधान.',
    verb: 'आहे.',
  },
  gu: {
    nothing: 'મને કંઈ સ્પષ્ટ દેખાતું નથી. કૃપા કરીને કૅમેરા ધીમે ફેરવો.',
    warning: 'સાવધાન.',
    verb: 'છે.',
  },
};

// An object filling this much of the frame, directly ahead, is close
// enough to be worth a warning. We say WHAT and WHERE, never a
// distance, because a single camera cannot measure distance.
const OBSTACLE_AREA = 0.20;

// Listening to more than three things at once is hard to follow.
const MAX_SPOKEN = 3;

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
const ALERTS = {
  en: { left: 'Careful, {obj} on your left.',    center: 'Careful, {obj} ahead.',    right: 'Careful, {obj} on your right.' },
  hi: { left: 'सावधान, बाईं ओर {obj}।',          center: 'सावधान, सामने {obj}।',      right: 'सावधान, दाईं ओर {obj}।' },
  mr: { left: 'सावधान, डावीकडे {obj}.',          center: 'सावधान, समोर {obj}.',       right: 'सावधान, उजवीकडे {obj}.' },
  gu: { left: 'સાવધાન, ડાબી બાજુ {obj}.',        center: 'સાવધાન, સામે {obj}.',       right: 'સાવધાન, જમણી બાજુ {obj}.' },
};

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
export function buildAlert(objects, lang = 'en') {
  if (!objects || objects.length === 0) return null;

  // Objects directly ahead matter most; something large to the side is
  // worth a mention only if it is very large.
  const candidate = objects.find(
    (o) => (o.position === 'center' && o.area >= OBSTACLE_AREA)
        || (o.position !== 'center' && o.area >= OBSTACLE_AREA * 2),
  );

  if (!candidate) return null;

  const template = (ALERTS[lang] ?? ALERTS.en)[candidate.position];
  const word = name(candidate.label, lang, 1);

  return {
    alert: template.replace('{obj}', word),
    key: `${candidate.label}|${candidate.position}`,
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
  const positions = POSITIONS[lang] ?? POSITIONS.en;

  if (!objects || objects.length === 0) {
    return { message: phrases.nothing, warning: false };
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

  const parts = ordered.map((g) => {
    const word = name(g.label, lang, g.n);
    const quantity = count(g.n, lang) ?? article(word);
    return `${quantity} ${word} ${positions[g.position]}`;
  });

  // A comma-separated list reads more naturally when spoken aloud.
  const list = parts.join(', ');

  const blocking = ordered.find(
    (g) => g.position === 'center' && g.area >= OBSTACLE_AREA,
  );

  // English puts the verb first ("There is a chair..."); Hindi, Marathi
  // and Gujarati put it last ("...खुर्ची आहे.").
  const sentence = lang === 'en'
    ? `${phrases.verb} ${list}.`
    : `${list} ${phrases.verb}`;

  return {
    message: blocking ? `${phrases.warning} ${sentence}` : sentence,
    warning: Boolean(blocking),
  };
}
