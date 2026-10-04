// =====================================================================
// measure-latency.js - how long until the user HEARS something?
//
//   node tests/measure-latency.js
//
// Follows the same steps the browser takes: send the photo, then request
// the spoken pieces (the first two at once). The number that matters is
// "first sound": the moment audio for the first piece is ready to play.
//
// Both services must be running (use start.bat).
// =====================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = 'http://localhost:3000';
const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const image = (file) =>
  'data:image/jpeg;base64,' + fs.readFileSync(path.join(fixtures, file)).toString('base64');

async function post(endpoint, body) {
  const response = await fetch(BASE + endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

const seconds = (ms) => (ms / 1000).toFixed(2).padStart(5) + 's';

// Request the first two pieces at once, as speech.js does, and report
// when each is ready.
async function timeSpeech(segments, language) {
  const started = Date.now();
  const ready = await Promise.all(
    segments.slice(0, 2).map(async (text) => {
      const r = await post('/api/speech', { text, language });
      return { at: Date.now() - started, source: r.source };
    }),
  );
  return { firstSound: Math.min(...ready.map((r) => r.at)), ready };
}

async function measure(label, endpoint, file, language) {
  const t0 = Date.now();
  const result = await post(endpoint, { image: image(file), language });
  const apiMs = Date.now() - t0;

  const segments = result.segments ?? [result.message];
  const speech = await timeSpeech(segments, language);

  const sources = speech.ready.map((r) => r.source).join('+');
  console.log(
    `${label.padEnd(34)} analyse ${seconds(apiMs)}   speech ${seconds(speech.firstSound)} (${sources.padEnd(10)})   ` +
    `HEARD AFTER ${seconds(apiMs + speech.firstSound)}`,
  );
}

console.log('\nTime until the user hears the answer (lower is better)\n');
console.log('Before this change, Marathi took about 0.1s to analyse and 3.6s+ to speak.\n');

for (const language of ['mr', 'hi', 'gu']) {
  await measure(`Detect Objects   [${language}]`, '/api/vision/detect', 'street.jpg', language);
}
for (const language of ['mr', 'hi']) {
  await measure(`Walk Mode alert  [${language}]`, '/api/vision/detect', 'very_close.jpg', language);
}
await measure('Read Text, English page [mr]', '/api/ocr', 'sign_en.jpg', 'mr');
console.log();
