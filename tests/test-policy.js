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
console.log(`\n${'='.repeat(50)}`);
console.log(`  ${passed} passed, ${failed} failed`);
console.log('='.repeat(50));
process.exit(failed ? 1 : 0);
