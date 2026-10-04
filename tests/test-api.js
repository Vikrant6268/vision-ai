// =====================================================================
// test-api.js - checks every backend feature in every language.
//
//   node tests/test-api.js
//
// Both services must be running (use start.bat).
//
// Covers what can be checked without a human: the APIs, the languages,
// the error handling. Camera, microphone and audio playback need a
// person and are listed in tests/MANUAL-TESTS.md.
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3000';
const LANGUAGES = ['en', 'hi', 'mr', 'gu'];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

function imageUrl(file) {
  const data = fs.readFileSync(path.join(FIXTURES, file)).toString('base64');
  return `data:image/jpeg;base64,${data}`;
}

async function post(endpoint, body) {
  const start = Date.now();
  const response = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), ms: Date.now() - start };
}

async function get(endpoint) {
  const response = await fetch(BASE + endpoint);
  return { status: response.status, data: await response.json() };
}

// Devanagari / Gujarati ranges - proves the reply really is in the
// requested script, not English text with a translated label.
const SCRIPTS = {
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  gu: /[઀-૿]/,
};

function inScript(text, lang) {
  return lang === 'en' ? /[a-zA-Z]/.test(text) : SCRIPTS[lang].test(text);
}

// ---------------------------------------------------------------------

async function testHealth() {
  section('1. Services');

  const node = await get('/api/health');
  check('Node backend responds', node.status === 200 && node.data.ok);
  check('Python AI service reachable', node.data.detectionAvailable === true,
    'start it with: cd ai-service; python run.py');
}

async function testDetection() {
  section('2. Object detection (YOLO)');

  const result = await post('/api/vision/detect', { image: imageUrl('street.jpg'), language: 'en' });

  check('Detects objects in a street photo', result.status === 200 && result.data.count > 0,
    `count=${result.data.count}`);
  check('Finds the bus', (result.data.objects || []).some((o) => o.label === 'bus'));
  check('Finds people', (result.data.objects || []).some((o) => o.label === 'person'));
  check('Reports left/center/right', (result.data.objects || []).every(
    (o) => ['left', 'center', 'right'].includes(o.position)));
  check(`Responds quickly (${result.ms}ms)`, result.ms < 3000, `${result.ms}ms`);

  for (const lang of LANGUAGES) {
    const r = await post('/api/vision/detect', { image: imageUrl('street.jpg'), language: lang });
    check(`Describes detections in ${lang}`, r.status === 200 && inScript(r.data.message, lang),
      r.data.message?.slice(0, 40));
  }

  // Each object is its own short sentence, so it can be fetched in
  // parallel and the common ones are already cached.
  const parts = await post('/api/vision/detect', { image: imageUrl('street.jpg'), language: 'en' });
  check('Answer is split into short spoken phrases',
    Array.isArray(parts.data.segments) && parts.data.segments.length >= 2,
    JSON.stringify(parts.data.segments));
  check('Each phrase is a single short sentence',
    (parts.data.segments || []).every((p) => p.length <= 60),
    JSON.stringify(parts.data.segments));
  check('Plural sentences use the plural verb', /There are two people/.test(parts.data.message),
    parts.data.message);
  check('Answer is limited to the two most relevant things',
    (parts.data.segments || []).filter((p) => p !== 'Careful.').length <= 2);

  const blank = await post('/api/vision/detect', { image: imageUrl('blank.jpg'), language: 'en' });
  check('Says so when nothing is detected', blank.status === 200 && /cannot see/i.test(blank.data.message));
}

async function testObstacles() {
  section('3. Walk Mode obstacle warnings');

  const far = await post('/api/vision/detect', { image: imageUrl('far.jpg'), language: 'en' });
  check('Warns about a large object ahead', Boolean(far.data.alert), far.data.alert || 'no alert');

  const veryClose = await post('/api/vision/detect', { image: imageUrl('very_close.jpg'), language: 'en' });
  check('Warns when the view is blocked (YOLO blind)', veryClose.data.viewBlocked === true);
  check('Blocked warning says STOP', /stop/i.test(veryClose.data.alert || ''), veryClose.data.alert);

  const blank = await post('/api/vision/detect', { image: imageUrl('blank.jpg'), language: 'en' });
  check('Silent when there is no obstacle', !blank.data.alert, blank.data.alert || '');

  // A dark frame has no edges and no focus either, so without a
  // brightness check it looks exactly like an object against the lens.
  const dark = await post('/api/vision/detect', { image: imageUrl('dark.jpg'), language: 'en' });
  check('Dark room reports darkness, not a collision', dark.data.tooDark === true);
  check('Dark warning asks for a light', /dark|light/i.test(dark.data.alert || ''), dark.data.alert);
  check('Dark room is NOT reported as blocked', dark.data.viewBlocked === false);

  const darkMr = await post('/api/vision/detect', { image: imageUrl('dark.jpg'), language: 'mr' });
  check('Dark warning in mr', inScript(darkMr.data.alert || '', 'mr'), darkMr.data.alert);

  for (const lang of ['mr', 'hi', 'gu']) {
    const r = await post('/api/vision/detect', { image: imageUrl('very_close.jpg'), language: lang });
    check(`Blocked warning in ${lang}`, inScript(r.data.alert || '', lang), r.data.alert);
  }
}

async function testOcr() {
  section('4. Read Text (OCR)');

  const english = await post('/api/ocr', { image: imageUrl('sign_en.jpg'), language: 'en' });
  check('Reads an English sign', english.status === 200 && /EMERGENCY EXIT/i.test(english.data.message),
    english.data.message?.slice(0, 50));

  const marathi = await post('/api/ocr', { image: imageUrl('sign_mr.jpg'), language: 'mr' });
  check('Reads a Marathi sign exactly', marathi.data.message?.includes('प्रवेशद्वार'),
    marathi.data.message?.slice(0, 50));
  check('Keeps conjunct consonants (स्टेशन)', marathi.data.message?.includes('स्टेशन'),
    marathi.data.message?.slice(0, 50));

  const blank = await post('/api/ocr', { image: imageUrl('blank.jpg'), language: 'en' });
  check('Admits failure instead of inventing text', blank.data.read === false);
}

async function testReadInUserLanguage() {
  section('5. Read Text speaks in the user language');

  const read = (file, language) => post('/api/ocr', { image: imageUrl(file), language });

  // Page already in the chosen language: the printed words, unchanged.
  const sameEn = await read('sign_en.jpg', 'en');
  check('English page, English user: exact words',
    /EMERGENCY EXIT/i.test(sameEn.data.message) && sameEn.data.translated === false,
    sameEn.data.message?.slice(0, 50));

  const sameMr = await read('sign_mr.jpg', 'mr');
  check('Marathi page, Marathi user: exact words',
    sameMr.data.message?.includes('प्रवेशद्वार') && sameMr.data.message?.includes('स्टेशन')
      && sameMr.data.translated === false,
    sameMr.data.message?.slice(0, 50));
  check('...and says it is the printed text', sameMr.data.message?.startsWith('यावर लिहिले आहे'));

  // Page in a DIFFERENT language: translated, whatever the page is in.
  for (const lang of ['mr', 'hi', 'gu']) {
    const r = await read('sign_en.jpg', lang);
    check(`English page, ${lang} user: translated into ${lang}`,
      r.status === 200 && inScript(r.data.message, lang) && r.data.translated === true,
      r.data.message?.slice(0, 45));
    check(`...no English left over in the ${lang} answer`, !/EMERGENCY EXIT/i.test(r.data.message),
      r.data.message?.slice(0, 45));
  }

  const toEn = await read('sign_mr.jpg', 'en');
  check('Marathi page, English user: translated into English',
    toEn.data.translated === true && /[a-zA-Z]{4}/.test(toEn.data.message)
      && !/[\u0900-\u097F]/.test(toEn.data.message),
    toEn.data.message?.slice(0, 60));

  // The listener must be able to tell a translation from the original.
  const translated = await read('sign_en.jpg', 'mr');
  check('A translation is announced as a translation',
    translated.data.message?.startsWith('याचा अर्थ आहे'), translated.data.message?.slice(0, 30));
  check('...so it differs from the printed-text wording',
    !translated.data.message?.startsWith('यावर लिहिले आहे'));

  check('Answer carries a short prefix phrase for fast, cached speech',
    Array.isArray(translated.data.segments) && translated.data.segments.length === 2
      && translated.data.segments[0].length < 40,
    JSON.stringify(translated.data.segments));

  // The old separate Translate flag is gone; sending it changes nothing.
  const flagged = await post('/api/ocr',
    { image: imageUrl('sign_en.jpg'), language: 'mr', translate: true });
  check('No separate translate mode any more',
    flagged.status === 200 && flagged.data.translated === translated.data.translated);
}

async function testSceneDescription() {
  section('6. Describe Scene (Gemini)');

  for (const lang of LANGUAGES) {
    const r = await post('/api/vision/describe', { image: imageUrl('street.jpg'), language: lang });
    check(`Describes the scene in ${lang}`, r.status === 200 && inScript(r.data.message, lang),
      r.data.message?.slice(0, 45));
  }
}

async function testSpeech() {
  section('7. Text to speech (Edge neural voices)');

  const speak = (text, language) => post('/api/speech', { text, language });

  for (const [lang, text] of [
    ['mr', 'तुमच्या समोर एक खुर्ची आहे.'],
    ['hi', 'आपके सामने एक कुर्सी है।'],
    ['gu', 'તમારી સામે એક ખુરશી છે.'],
    ['en', 'There is a chair in front of you.'],
  ]) {
    const r = await speak(text, lang);
    check(`Produces ${lang} audio`,
      r.status === 200 && Boolean(r.data.audio) && /audio\//.test(r.data.mimeType || ''),
      r.data.error);
  }

  // Fixed phrases are cached; the second request must be much faster.
  const phrase = 'सावधान, समोर खुर्ची.';
  await post('/api/speech/warm', { language: 'mr', phrases: [phrase] });
  await speak(phrase, 'mr');
  const again = await speak(phrase, 'mr');
  check('A repeated fixed phrase comes from the cache', again.data.source === 'cache', again.data.source);
  check(`...and is fast (${again.ms}ms)`, again.ms < 500, `${again.ms}ms`);

  // Text the user had read aloud must NOT be stored on the server.
  const secret = `गोपनीय चाचणी मजकूर ${Date.now()}`;
  await speak(secret, 'mr');
  const secretAgain = await speak(secret, 'mr');
  check('Text that is not a fixed phrase is never cached', secretAgain.data.source === 'live',
    secretAgain.data.source);

  // The reason Read Text used to fall silent: one long text took far
  // longer than the server would wait. Pieces must come back promptly.
  const piece = ('येथे एक लांब मजकूर आहे जो पुस्तकाच्या पानावर छापलेला असू शकतो. ').repeat(2).trim();
  const long = await speak(piece, 'mr');
  check(`A paragraph-sized piece is synthesised in time (${(long.ms / 1000).toFixed(1)}s)`,
    long.status === 200 && long.ms < 12000, `${long.ms}ms`);

  const empty = await speak('', 'mr');
  check('Rejects empty text cleanly', empty.status === 400 && Boolean(empty.data.error));

  const warm = await post('/api/speech/warm', { language: 'xx', phrases: [] });
  check('Warm-up rejects an unsupported language', warm.status === 400);

  const warmEn = await post('/api/speech/warm', { language: 'en', phrases: [] });
  check('English is never pre-generated (the browser speaks it)', warmEn.data.queued === 0);

  const stats = await get('/api/speech/stats');
  check('Stats endpoint reports where speech came from',
    stats.status === 200 && typeof stats.data.cacheHits === 'number');
  console.log(`        edge=${stats.data.edge} cache=${stats.data.cacheHits} gemini=${stats.data.gemini} failed=${stats.data.failed}`);
  check('Edge voices served requests without needing Gemini', stats.data.gemini === 0,
    `gemini=${stats.data.gemini}`);
}

async function testErrorHandling() {
  section('8. Error handling');

  const notFound = await get('/api/does-not-exist');
  check('Unknown route returns a spoken-friendly error',
    notFound.status === 404 && /not understood/i.test(notFound.data.error));

  const noImage = await post('/api/vision/detect', { language: 'en' });
  check('Missing image is rejected clearly',
    noImage.status === 400 && /picture/i.test(noImage.data.error), noImage.data.error);

  const badImage = await post('/api/ocr', { image: 'not-an-image', language: 'en' });
  check('Invalid image is rejected clearly', badImage.status === 400);

  const badLang = await post('/api/vision/detect', { image: imageUrl('street.jpg'), language: 'zz' });
  check('Unknown language falls back to English',
    badLang.status === 200 && /There is|cannot see/i.test(badLang.data.message));

  // Every error must be a plain sentence, never a stack trace or code.
  const errors = [notFound.data.error, noImage.data.error, badImage.data.error];
  check('No technical jargon in any error message',
    errors.every((e) => e && !/undefined|null|Error:|at \w+\./.test(e)));
}

async function testFrontend() {
  section('9. Frontend files');

  const page = await fetch(BASE + '/');
  const html = await page.text();

  check('Page loads', page.status === 200);
  check('No cached JS in development', page.headers.get('cache-control') === 'no-store');
  check('Has a language selector', html.includes('id="language"'));
  check('Has a microphone button', html.includes('id="btn-mic"'));
  check('Has a skip link for keyboard users', html.includes('skip-link'));
  check('Buttons have ARIA state where needed', html.includes('aria-pressed'));
  check('Status region announces changes', html.includes('aria-live'));
  check('No face recognition left', !/who is this/i.test(html));
  check('Read and Translate are one button',
    !html.includes('data-action="translate"') && html.includes('data-action="read"'));

  for (const file of ['js/app.js', 'js/voice.js', 'js/commands.js', 'js/walk.js',
                      'js/alertPolicy.js', 'js/sound.js', 'js/textSplit.js',
                      'js/camera.js', 'js/speech.js', 'js/api.js', 'js/languages.js',
                      'css/style.css', 'css/accessibility.css']) {
    const r = await fetch(`${BASE}/${file}`);
    check(`Serves ${file}`, r.status === 200);
  }
}

// ---------------------------------------------------------------------

async function main() {
  console.log('='.repeat(60));
  console.log('Vision AI - automated feature tests');
  console.log('='.repeat(60));

  const started = Date.now();

  try {
    await testHealth();
    await testDetection();
    await testObstacles();
    await testOcr();
    await testReadInUserLanguage();
    await testSceneDescription();
    await testSpeech();
    await testErrorHandling();
    await testFrontend();
  } catch (error) {
    console.error('\nTest run stopped:', error.message);
    failed += 1;
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${passed} passed, ${failed} failed   (${seconds}s)`);

  if (failures.length) {
    console.log('\n  Failed:');
    failures.forEach((f) => console.log(`    - ${f}`));
  }

  console.log('='.repeat(60));
  process.exit(failed ? 1 : 0);
}

main();
