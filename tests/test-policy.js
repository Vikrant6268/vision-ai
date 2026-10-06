// =====================================================================
// test-policy.js - the rules for WHEN Walk Mode speaks, and how long
// text is cut for speech.
//
//   node tests/test-policy.js
//
// These need no server and no camera: they run the pure logic against
// recorded sequences of frames. They exist because the first Walk Mode
// passed every API test and was still unusable in practice - it repeated
// the same warning for as long as the obstacle stayed in view. Checking
// single responses cannot catch that; checking a SEQUENCE can.
// =====================================================================

import { createAlertPolicy } from '../frontend/js/alertPolicy.js';
import { splitText, FIRST_PIECE, NEXT_PIECE } from '../frontend/js/textSplit.js';
import { detectLanguage, isInLanguage } from '../backend/services/languageDetect.js';
import { decode, analyseProximity, cannyDensity } from '../frontend/js/onDeviceDetector.js';

let passed = 0;
let failed = 0;

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
}

// Run a policy over frames spaced `gapMs` apart; return what it decided.
function simulate(frames, { gapMs = 500, ...options } = {}) {
  let clock = 0;
  const policy = createAlertPolicy({ ...options, now: () => clock });

  return frames.map((key) => {
    const decision = policy.update(key);
    clock += gapMs;
    return decision;
  });
}

const count = (decisions, what) => decisions.filter((d) => d === what).length;

// ---------------------------------------------------------------------
console.log('\nWalk Mode: when to speak');
console.log('------------------------');

{
  // The reported bug: an obstacle in view for 30 seconds.
  const frames = Array(60).fill('blocked');
  const out = simulate(frames);

  check('Warns exactly once while an obstacle stays in view', count(out, 'announce') === 1,
    `announced ${count(out, 'announce')} times`);
  check('Warns on the FIRST frame, not later', out[0] === 'announce');
}

{
  const out = simulate(Array(60).fill('blocked'));    // 30 s at 2 frames/s
  check('Only reminds with a tone, about every 10 s', count(out, 'remind') === 2,
    `reminded ${count(out, 'remind')} times`);
}

{
  const out = simulate(['chair|center', 'chair|center', null, null, null, null, 'chair|center'],
    { minGapMs: 0 });
  check('Warns again when the obstacle goes away and comes back', count(out, 'announce') === 2,
    JSON.stringify(out));
}

{
  const out = simulate(['bus|center', null, 'bus|center', 'bus|center']);
  check('One empty frame does not count as "gone"', count(out, 'announce') === 1,
    JSON.stringify(out));
}

{
  // Same object flickering off and on within a few seconds.
  const out = simulate(['bus|center', null, null, 'bus|center'], { minGapMs: 6000 });
  check('Does not re-announce the same thing within the minimum gap', count(out, 'announce') === 1,
    JSON.stringify(out));
}

{
  const out = simulate(['bus|center', 'bus|center', null, null, 'person|left']);
  check('A different obstacle is announced separately', count(out, 'announce') === 2,
    JSON.stringify(out));
}

{
  const out = simulate(Array(40).fill(null));
  check('Stays completely silent in an empty room', out.every((d) => d === null));
}

{
  // The user sees nothing: obstacle gone -> silence, no stray tone.
  const out = simulate(['bus|center', null, null, null, null, null, null]);
  check('Says nothing when the obstacle leaves', count(out, 'announce') === 1 && count(out, 'remind') === 0);
}

{
  let clock = 0;
  const policy = createAlertPolicy({ now: () => clock });
  policy.update('chair|center');
  policy.reset();
  check('reset() forgets earlier warnings', policy.update('chair|center') === 'announce');
}

// ---------------------------------------------------------------------
console.log('\nSpeech: cutting text into pieces');
console.log('--------------------------------');

{
  const short = 'Careful, chair ahead.';
  check('A short phrase stays in one piece', splitText(short).length === 1 && splitText(short)[0] === short);
}

{
  const sentence = 'एक बस तुमच्या समोर आहे.';
  check('A fixed phrase comes back unchanged (so cached audio matches)',
    splitText(sentence)[0] === sentence && splitText(sentence).length === 1);
}

{
  const page = ('येथे एक लांब मजकूर आहे जो पुस्तकाच्या पानावर छापलेला असू शकतो. ').repeat(7).trim();
  const pieces = splitText(page);

  check('A long text becomes several pieces', pieces.length > 1, `${pieces.length} pieces`);
  check(`First piece is short, so speech starts fast (<= ${FIRST_PIECE})`, pieces[0].length <= FIRST_PIECE,
    `${pieces[0].length} chars`);
  check(`Later pieces stay under ${NEXT_PIECE}`, pieces.slice(1).every((p) => p.length <= NEXT_PIECE),
    pieces.map((p) => p.length).join(','));
  check('Cutting loses no words',
    pieces.join(' ').replace(/\s+/g, ' ') === page.replace(/\s+/g, ' '));
  check('Pieces end at sentence boundaries', pieces.every((p) => /[.!?।॥]$/.test(p)));
}

{
  const noPunctuation = 'word '.repeat(80).trim();
  const pieces = splitText(noPunctuation);
  check('Text with no punctuation is still cut', pieces.length > 1 && pieces.every((p) => p.length <= NEXT_PIECE));
}

{
  check('Empty text gives no pieces', splitText('').length === 0 && splitText('   ').length === 0);
  check('Devanagari danda ends a sentence', splitText('पहिले वाक्य। दुसरे वाक्य।').join('|').includes('वाक्य।'));
}

// ---------------------------------------------------------------------
console.log('\nRead Text: which language is a page in?');
console.log('---------------------------------------');

{
  const cases = [
    ['EMERGENCY EXIT Platform 3 Keep Left', 'en'],
    ['प्रकरण ३: जलचक्र. पृथ्वीवरील पाणी महासागर, हवा आणि जमीन यांच्यामध्ये सतत फिरत असते.', 'mr'],
    ['अध्याय 3: जल चक्र। पृथ्वी पर पानी लगातार महासागरों, हवा और ज़मीन के बीच घूमता है।', 'hi'],
    ['પ્રકરણ ૩: જળચક્ર. પૃથ્વી પરનું પાણી સતત ફરતું રહે છે.', 'gu'],
    ['प्रवेशद्वार पुणे स्टेशन', 'deva'],
    ['12345 ---', 'other'],
  ];
  for (const [text, expected] of cases) {
    check(`Detects ${expected.padEnd(5)} "${text.slice(0, 28)}"`, detectLanguage(text) === expected,
      `got ${detectLanguage(text)}`);
  }

  check('A Marathi translation with "Platform 3" left in is still Marathi',
    detectLanguage('आपत्कालीन बाहेर पडण्याचा मार्ग Platform 3 डावीकडे राहा') === 'mr');
}

{
  check('English page needs translating for a Marathi user', !isInLanguage('EMERGENCY EXIT', 'mr'));
  check('Hindi page needs translating for a Marathi user',
    !isInLanguage('पृथ्वी पर पानी लगातार महासागरों और ज़मीन के बीच घूमता है।', 'mr'));
  check('A short Devanagari sign is fine for a Marathi user as it is',
    isInLanguage('प्रवेशद्वार पुणे स्टेशन', 'mr'));
  check('...and for a Hindi user', isInLanguage('प्रवेशद्वार पुणे स्टेशन', 'hi'));
  check('...but not for an English user', !isInLanguage('प्रवेशद्वार पुणे स्टेशन', 'en'));
  check('Gujarati text is not accepted as Marathi', !isInLanguage('તમારી સામે એક ખુરશી છે.', 'mr'));
}

// ---------------------------------------------------------------------
console.log('\nIn-browser detection (phones)');
console.log('------------------------------');

{
  // A fake YOLO output: 84 rows x 3 candidate boxes. Box 0 is a chair in
  // the middle, box 1 a weaker duplicate of it, box 2 below the threshold.
  const rows = 84;
  const count = 3;
  const out = new Float32Array(rows * count);
  const set = (row, box, value) => { out[row * count + box] = value; };
  const CHAIR = 56;

  // centre x, centre y, width, height (in 320 px model space)
  [[160, 160, 100, 100], [162, 158, 96, 104], [40, 40, 10, 10]].forEach((b, i) => b.forEach((v, r) => set(r, i, v)));
  set(4 + CHAIR, 0, 0.9);
  set(4 + CHAIR, 1, 0.7);
  set(4 + 0, 2, 0.2);                       // a "person" below the 0.45 threshold

  // A 640 x 640 frame that fills the model input exactly (scale 0.5).
  const objects = decode(out, rows, count, { width: 640, height: 640 }, { scale: 0.5, dx: 0, dy: 0 });

  check('Finds the chair', objects.length >= 1 && objects[0].label === 'chair', JSON.stringify(objects));
  check('Removes the duplicate box of the same chair', objects.length === 1, `${objects.length} objects`);
  check('Ignores detections below the confidence threshold', !objects.some((o) => o.label === 'person'));
  check('Works out that it is in the centre', objects[0]?.position === 'center');
  check('Measures how much of the frame it fills', Math.abs(objects[0]?.area - 0.0977) < 0.001, objects[0]?.area);
}

{
  const w = 64; const h = 48;
  const flat = (value) => new Uint8ClampedArray(w * h).fill(value);
  const checker = new Uint8ClampedArray(w * h).map((_, i) => (((i % w) >> 3) + ((i / w) >> 3)) % 2 ? 220 : 30);

  check('A dark frame is "too dark", not a collision', analyseProximity(flat(15), w, h).tooDark === true
    && analyseProximity(flat(15), w, h).viewBlocked === false);
  check('A flat, featureless bright frame counts as blocked', analyseProximity(flat(160), w, h).viewBlocked === true);
  check('A detailed scene is clear', analyseProximity(checker, w, h).viewBlocked === false
    && cannyDensity(checker, w, h) > 0.05);
}

// ---------------------------------------------------------------------
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
process.exit(failed ? 1 : 0);
