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

async function testTranslation() {
  section('5. Translate');

  for (const lang of ['mr', 'hi', 'gu']) {
    const r = await post('/api/ocr', { image: imageUrl('sign_en.jpg'), language: lang, translate: true });
    check(`Translates an English sign into ${lang}`,
      r.status === 200 && inScript(r.data.message, lang) && r.data.translated === true,
      r.data.message?.slice(0, 45));
  }

  const read = await post('/api/ocr', { image: imageUrl('sign_en.jpg'), language: 'mr' });
  const translated = await post('/api/ocr', { image: imageUrl('sign_en.jpg'), language: 'mr', translate: true });
  check('Read and Translate give different answers',
    read.data.message !== translated.data.message);
  check('Read keeps the English words', /EMERGENCY|Platform/i.test(read.data.message));
  check('Translate does not keep the English words', !/EMERGENCY EXIT/i.test(translated.data.message),
    translated.data.message?.slice(0, 45));
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
  section('7. Text to speech');

  const usage = await get('/api/speech/usage');
  check('Usage endpoint works', usage.status === 200);
  console.log(`        quota used: ${usage.data.used}/${usage.data.limit}`);

  const marathi = await post('/api/speech', { text: 'तुमच्या समोर एक खुर्ची आहे.' });
  check('Produces Marathi audio', marathi.status === 200 && Boolean(marathi.data.audio));
  check('Audio is a playable format', /audio\//.test(marathi.data.mimeType || ''), marathi.data.mimeType);

  const empty = await post('/api/speech', { text: '' });
  check('Rejects empty text cleanly', empty.status === 400 && Boolean(empty.data.error));
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

  for (const file of ['js/app.js', 'js/voice.js', 'js/commands.js', 'js/walk.js',
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
    await testTranslation();
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
