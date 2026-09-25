// =====================================================================
// pythonService.js – the ONLY file that talks to the Python AI service.
//
//   Node (here)  --HTTP-->  FastAPI  -->  YOLO / OpenCV
//
// The Python service is optional: if it isn't running, the rest of the
// app (scene description via Gemini) keeps working and the user is told
// clearly which feature is unavailable.
// =====================================================================

import { config } from '../config/env.js';

const TIMEOUT_MS = 20000;

function userError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

async function callPython(path, body, timeoutMs = TIMEOUT_MS, feature = 'Object detection') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(config.pythonAiUrl + path, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (cause) {
    console.error('[python] unreachable:', cause.name);
    throw userError(
      `${feature} is not available right now. Please try describing the scene instead.`,
      503,
    );
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[python]', response.status, data?.detail || '');
    throw userError(`${feature} failed. Please try again.`, 502);
  }

  return data;
}

export function detectObjects(base64Image, confidence = 0.45) {
  return callPython('/detect', { image: base64Image, confidence });
}

// OCR gets a longer timeout: the first call downloads and loads the
// language model, which can take a minute.
export function readText(base64Image, language) {
  return callPython('/ocr', { image: base64Image, language }, 90000, 'Text reading');
}

// Used by the health endpoint so the UI can report what's available.
export async function isAvailable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const response = await fetch(config.pythonAiUrl + '/health', { signal: controller.signal });
    clearTimeout(timer);
    return response.ok;
  } catch {
    return false;
  }
}
