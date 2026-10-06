// =====================================================================
// onDeviceDetector.js - object detection that runs on the user's own
// device, inside the browser.
//
// Why: the Python YOLO service needs a machine with several GB of memory,
// which free hosting does not provide. Running YOLO in the browser makes
// Detect Objects and Walk Mode work on any phone that opens the link, and
// it has three side benefits:
//
//   - no network delay for obstacle warnings (they matter most)
//   - camera frames never leave the phone (privacy)
//   - no server cost, however many people use it
//
// The model is the same YOLO11n, exported to ONNX at 320 x 320, and run
// with ONNX Runtime Web (WebAssembly). On our test photos it found the
// same objects as the 640 px PyTorch model the Python service uses.
//
// It returns the same shape of result as the Python service, so the rest
// of the app does not care which one did the work:
//   { objects: [{label, confidence, position, area}], viewBlocked, tooDark }
// =====================================================================

import { COCO_LABELS } from './cocoLabels.js';

const ENGINE_URL = '/vendor/ort/ort.wasm.min.js';
const ENGINE_DIR = '/vendor/ort/';
const MODEL_URL = '/models/yolo11n-320.onnx';

const INPUT_SIZE = 320;
const CONFIDENCE = 0.45;     // same as the Python service
const IOU_LIMIT = 0.5;       // boxes overlapping more than this are duplicates
const MAX_OBJECTS = 20;

// Proximity thresholds - identical to ai-service/services/proximity_service.py,
// computed the same way (OpenCV's Canny and Laplacian, ported below).
const EDGE_THRESHOLD = 0.05;
const FOCUS_THRESHOLD = 120;
const DARK_THRESHOLD = 45;

let session = null;
let loading = null;

// ---------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error('Could not load the detection engine.'));
    document.head.append(script);
  });
}

/**
 * Download the engine and the model (about 13 MB the first time; the
 * browser caches them afterwards). Safe to call repeatedly.
 */
export function prepare() {
  loading ??= (async () => {
    if (!('WebAssembly' in window)) throw new Error('This browser cannot run object detection.');

    if (!window.ort) await loadScript(ENGINE_URL);

    const { ort } = window;
    ort.env.wasm.wasmPaths = ENGINE_DIR;
    // One thread: several threads need special server headers, and one
    // thread is plenty for a 320 px image.
    ort.env.wasm.numThreads = 1;

    session = await ort.InferenceSession.create(MODEL_URL, {
      executionProviders: ['wasm'],
      graphOptimizationLevel: 'all',
    });
  })();

  // A failed load can be retried later (e.g. after a network drop).
  loading.catch(() => { loading = null; });
  return loading;
}

export function isReady() {
  return session !== null;
}

// ---------------------------------------------------------------------
// Preparing the image for the model
// ---------------------------------------------------------------------

// Created on first use, so this module can also be loaded by the tests,
// which run in Node where there is no canvas.
let modelContext = null;

// Fit the frame into a 320 x 320 square without stretching it, filling
// the spare space with grey - the "letterbox" YOLO was trained with.
function letterbox(source) {
  if (!modelContext) {
    const canvas = document.createElement('canvas');
    canvas.width = INPUT_SIZE;
    canvas.height = INPUT_SIZE;
    modelContext = canvas.getContext('2d', { willReadFrequently: true });
  }

  const scale = Math.min(INPUT_SIZE / source.width, INPUT_SIZE / source.height);
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);
  const dx = Math.floor((INPUT_SIZE - width) / 2);
  const dy = Math.floor((INPUT_SIZE - height) / 2);

  modelContext.fillStyle = 'rgb(114,114,114)';
  modelContext.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  modelContext.drawImage(source, dx, dy, width, height);

  // Pixels as RGBA bytes → the model wants three planes (R, G, B) of
  // floats between 0 and 1.
  const { data } = modelContext.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const input = new Float32Array(plane * 3);

  for (let i = 0; i < plane; i += 1) {
    input[i] = data[i * 4] / 255;
    input[i + plane] = data[i * 4 + 1] / 255;
    input[i + plane * 2] = data[i * 4 + 2] / 255;
  }

  return { input, scale, dx, dy };
}

// ---------------------------------------------------------------------
// Reading the model's answer
// ---------------------------------------------------------------------

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const overlap = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - overlap;
  return union > 0 ? overlap / union : 0;
}

/**
 * Turn YOLO's raw output into a list of objects.
 *
 * The output is 84 rows x 2100 candidate boxes: rows 0-3 are the box
 * (centre x, centre y, width, height) and rows 4-83 the score for each
 * of the 80 classes. We keep confident candidates, then remove
 * duplicates of the same object (non-maximum suppression).
 *
 * Exported so the tests can check it without a browser.
 */
export function decode(output, rows, count, frame, box) {
  const candidates = [];

  for (let i = 0; i < count; i += 1) {
    let best = 0;
    let bestClass = -1;
    for (let c = 4; c < rows; c += 1) {
      const score = output[c * count + i];
      if (score > best) { best = score; bestClass = c - 4; }
    }
    if (best < CONFIDENCE) continue;

    const cx = output[i];
    const cy = output[count + i];
    const w = output[2 * count + i];
    const h = output[3 * count + i];

    // Undo the letterbox: back to the original frame's pixels.
    candidates.push({
      cls: bestClass,
      score: best,
      x1: Math.max(0, (cx - w / 2 - box.dx) / box.scale),
      y1: Math.max(0, (cy - h / 2 - box.dy) / box.scale),
      x2: Math.min(frame.width, (cx + w / 2 - box.dx) / box.scale),
      y2: Math.min(frame.height, (cy + h / 2 - box.dy) / box.scale),
    });
  }

  // Strongest first; drop any box that mostly overlaps a stronger box of
  // the same class.
  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const candidate of candidates) {
    if (kept.length >= MAX_OBJECTS) break;
    if (kept.some((k) => k.cls === candidate.cls && iou(k, candidate) > IOU_LIMIT)) continue;
    kept.push(candidate);
  }

  const frameArea = frame.width * frame.height;

  // Same fields, same rules as ai-service/services/yolo_service.py.
  const objects = kept.map((k) => {
    const centre = (k.x1 + k.x2) / 2;
    const position = centre < frame.width / 3 ? 'left'
      : centre > (frame.width * 2) / 3 ? 'right'
      : 'center';

    return {
      label: COCO_LABELS[k.cls] ?? `object ${k.cls}`,
      confidence: Math.round(k.score * 1000) / 1000,
      position,
      area: Math.round(((k.x2 - k.x1) * (k.y2 - k.y1) / frameArea) * 10000) / 10000,
    };
  });

  // Biggest first: they matter most to the user.
  return objects.sort((a, b) => b.area - a.area);
}

// ---------------------------------------------------------------------
// "Is something right against the camera?" - a port of
// ai-service/services/proximity_service.py, which explains the idea.
// ---------------------------------------------------------------------

/**
 * Edge density as OpenCV's Canny(gray, 50, 150) computes it: Sobel
 * gradients, thinning to one-pixel lines, then keeping strong edges and
 * weak edges connected to strong ones. Returns the fraction of pixels
 * that are edges.
 */
export function cannyDensity(gray, width, height, low = 50, high = 150) {
  const size = width * height;
  const magnitude = new Float32Array(size);
  const direction = new Uint8Array(size);   // 0: horizontal, 1: 45°, 2: vertical, 3: 135°

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const tl = gray[i - width - 1], t = gray[i - width], tr = gray[i - width + 1];
      const l = gray[i - 1], r = gray[i + 1];
      const bl = gray[i + width - 1], b = gray[i + width], br = gray[i + width + 1];

      const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      magnitude[i] = Math.abs(gx) + Math.abs(gy);   // OpenCV's default (L1)

      const ax = Math.abs(gx);
      const ay = Math.abs(gy);
      // tan(22.5°) ≈ 0.4142, tan(67.5°) ≈ 2.4142
      if (ay <= ax * 0.4142) direction[i] = 0;
      else if (ay >= ax * 2.4142) direction[i] = 2;
      else direction[i] = (gx ^ gy) < 0 ? 3 : 1;
    }
  }

  // Thin: keep a pixel only if it is the strongest along its gradient.
  const state = new Uint8Array(size);   // 0 none, 1 weak, 2 strong
  const stack = [];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const m = magnitude[i];
      if (m <= low) continue;

      // Neighbours along the gradient, and the same tie rules as OpenCV
      // (strictly greater on one side, greater-or-equal on the other).
      let keep;
      switch (direction[i]) {
        case 0: keep = m > magnitude[i - 1] && m >= magnitude[i + 1]; break;
        case 2: keep = m > magnitude[i - width] && m >= magnitude[i + width]; break;
        // gradient signs agree: up-left / down-right
        case 1: keep = m > magnitude[i - width - 1] && m > magnitude[i + width + 1]; break;
        // gradient signs differ: up-right / down-left
        default: keep = m > magnitude[i - width + 1] && m > magnitude[i + width - 1];
      }
      if (!keep) continue;

      if (m > high) { state[i] = 2; stack.push(i); } else state[i] = 1;
    }
  }

  // Weak edges survive only if connected to a strong one.
  while (stack.length) {
    const i = stack.pop();
    for (const d of [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1]) {
      if (state[i + d] === 1) { state[i + d] = 2; stack.push(i + d); }
    }
  }

  let edges = 0;
  for (let i = 0; i < size; i += 1) if (state[i] === 2) edges += 1;
  return edges / size;
}

/** Variance of the Laplacian - OpenCV's Laplacian(gray, CV_64F).var(). */
export function laplacianVariance(gray, width, height) {
  let sum = 0;
  let sumSquares = 0;
  let n = 0;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const value = gray[i - width] + gray[i + width] + gray[i - 1] + gray[i + 1] - 4 * gray[i];
      sum += value;
      sumSquares += value * value;
      n += 1;
    }
  }

  const mean = sum / n;
  return sumSquares / n - mean * mean;
}

/** Grey levels the way OpenCV converts colour (ITU-R BT.601). */
export function toGray(rgba, size) {
  const gray = new Uint8ClampedArray(size);
  for (let i = 0; i < size; i += 1) {
    gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2] + 0.5;
  }
  return gray;
}

export function analyseProximity(gray, width, height) {
  let total = 0;
  for (let i = 0; i < gray.length; i += 1) total += gray[i];
  const brightness = total / gray.length;

  const tooDark = brightness < DARK_THRESHOLD;
  const edgeDensity = cannyDensity(gray, width, height);
  const focus = laplacianVariance(gray, width, height);

  return {
    tooDark,
    viewBlocked: !tooDark && edgeDensity < EDGE_THRESHOLD && focus < FOCUS_THRESHOLD,
    edgeDensity: Math.round(edgeDensity * 10000) / 10000,
    focus: Math.round(focus * 10) / 10,
    brightness: Math.round(brightness * 10) / 10,
  };
}

// ---------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------

/**
 * Detect objects in a frame (a canvas, ideally about 640 px wide - the
 * size the proximity thresholds were calibrated at).
 */
export async function detect(frame) {
  await prepare();

  const { ort } = window;
  const box = letterbox(frame);
  const tensor = new ort.Tensor('float32', box.input, [1, 3, INPUT_SIZE, INPUT_SIZE]);

  const started = performance.now();
  const results = await session.run({ [session.inputNames[0]]: tensor });
  const output = results[session.outputNames[0]];
  const inferenceMs = Math.round(performance.now() - started);

  const [, rows, count] = output.dims;
  const objects = decode(output.data, rows, count, frame, box);

  const pixels = frame.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, frame.width, frame.height).data;
  const gray = toGray(pixels, frame.width * frame.height);
  const proximity = analyseProximity(gray, frame.width, frame.height);

  return { ok: true, count: objects.length, objects, ...proximity, inferenceMs, device: 'browser' };
}
