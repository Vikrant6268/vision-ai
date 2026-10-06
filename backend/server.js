// =====================================================================
// server.js – Vision AI backend entry point.
//
//   Browser  ──►  Express (this file)  ──►  Gemini / Python AI service
//
// Express serves the frontend files AND provides the /api/* routes,
// so the whole app runs from a single address: http://localhost:3000
// =====================================================================

import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from './config/env.js';
import healthRouter from './routes/health.js';
import visionRouter from './routes/vision.js';
import speechRouter from './routes/speech.js';
import ocrRouter from './routes/ocr.js';
import { notFound, errorHandler } from './middleware/errorHandler.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, '..', 'frontend');
const sharedDir = path.join(__dirname, '..', 'shared');
const fixturesDir = path.join(__dirname, '..', 'tests', 'fixtures');

// ONNX Runtime Web: the engine that runs YOLO inside the browser.
const onnxRuntimeDir = path.join(__dirname, '..', 'node_modules', 'onnxruntime-web', 'dist');

const app = express();
const production = config.env === 'production';

// Hosting platforms put a proxy in front of the app. Trusting it lets us
// see each visitor's real address; without it every request appears to
// come from the proxy, and the rate limits below would be shared by
// everyone at once.
if (production) app.set('trust proxy', 1);

// ---------- Middleware (runs on every request, in this order) ----------

// Secure headers, including a Content Security Policy: the page may only
// load scripts, styles and data from this server. The frontend has no
// inline scripts and no third-party files, so nothing needs an exception.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'wasm-unsafe-eval' lets the page start WebAssembly (the in-browser
      // detection engine). It does NOT allow eval() of JavaScript.
      scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'", 'data:', 'blob:'],   // spoken audio arrives as data: URLs
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      // The host already redirects to HTTPS. Forcing it here would break
      // http://localhost during development.
      upgradeInsecureRequests: null,
    },
  },
}));

app.use(compression());                              // gzip: the 14 MB detection engine travels as 3.5 MB
app.use(morgan(production ? 'combined' : 'dev'));   // request log
app.use(express.json({ limit: '10mb' }));            // photos arrive as base64 JSON

// Describe Scene and Read Text each cost Gemini quota, which the free
// tier limits to about 15 a minute per model. Once the app is public, one
// visitor must not be able to use it all up for everyone else.
// Object detection is NOT limited: it runs locally on YOLO, and Walk Mode
// calls it twice a second.
const aiLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  skip: () => !production,        // never in the way while developing
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please wait a moment and try again.' },
});

// ---------- Files for in-browser detection ----------
// The engine and the model are large and never change under the same
// name, so browsers may keep them for a month. A phone downloads them
// once, not on every visit.
const longCache = { maxAge: production ? '30d' : 0, immutable: production };

app.use('/vendor/ort', express.static(onnxRuntimeDir, longCache));
app.use('/models', express.static(path.join(frontendDir, 'models'), longCache));

// Code shared by the server and the browser (the sentence builder).
app.use('/shared', express.static(sharedDir, {
  setHeaders(res) {
    if (!production) res.setHeader('Cache-Control', 'no-store');
  },
}));

// Test photos, so the in-browser detector can be checked against the
// same images as the server. Development only.
if (!production) app.use('/test-fixtures', express.static(fixturesDir));

// ---------- Static frontend ----------
// In development the browser must never serve a cached copy of our
// JavaScript: editing a file and seeing the OLD behaviour wastes more
// time than the caching saves. Production keeps normal caching.
app.use(express.static(frontendDir, {
  etag: config.env !== 'development',
  lastModified: config.env !== 'development',
  setHeaders(res) {
    if (config.env === 'development') {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// ---------- API routes ----------
app.use('/api/health', healthRouter);
app.use('/api/vision/describe', aiLimit);     // Gemini - limited
app.use('/api/vision', visionRouter);         // /detect is local YOLO - not limited
app.use('/api/ocr', aiLimit, ocrRouter);      // Gemini - limited
app.use('/api/speech', speechRouter);         // has its own, higher limit

// ---------- Errors (must be last) ----------
app.use(notFound);
app.use(errorHandler);

// ---------- Start ----------
app.listen(config.port, () => {
  console.log(`Vision AI backend running at http://localhost:${config.port}  [${config.env}]`);
});
