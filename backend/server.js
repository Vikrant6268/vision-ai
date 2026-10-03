// =====================================================================
// server.js – Vision AI backend entry point.
//
//   Browser  ──►  Express (this file)  ──►  Gemini / Python AI service
//
// Express serves the frontend files AND provides the /api/* routes,
// so the whole app runs from a single address: http://localhost:3000
// =====================================================================

import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
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

const app = express();

// ---------- Middleware (runs on every request, in this order) ----------
app.use(helmet({ contentSecurityPolicy: false }));  // secure headers; CSP tuned in deployment phase
app.use(morgan('dev'));                              // request log: "GET /api/health 200 3ms"
app.use(express.json({ limit: '10mb' }));            // parse JSON bodies (images arrive as base64 later)

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
app.use('/api/vision', visionRouter);
app.use('/api/speech', speechRouter);
app.use('/api/ocr', ocrRouter);

// ---------- Errors (must be last) ----------
app.use(notFound);
app.use(errorHandler);

// ---------- Start ----------
app.listen(config.port, () => {
  console.log(`Vision AI backend running at http://localhost:${config.port}  [${config.env}]`);
});
