// =====================================================================
// api.js – the ONLY file that talks to the backend.
//
// `request()` wraps fetch() and turns every failure into a plain-English
// Error message, because app.js will SPEAK whatever error it receives.
// A blind user must never hear "TypeError: Failed to fetch".
// =====================================================================

const API_BASE = '/api';

async function request(path, options = {}, timeoutMs = 0) {
  let response;

  // Walk Mode passes a short timeout so a slow frame is dropped rather
  // than queued behind the next one.
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    response = await fetch(API_BASE + path, { ...options, signal: controller?.signal });
  } catch {
    // Network-level failure: server not running, no connection, etc.
    throw new Error('I cannot reach the server. Please make sure Vision AI is running.');
  } finally {
    if (timer) clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'The server returned an error. Please try again.');
  }

  return data;
}

// ---------- Real ----------
export function checkHealth() {
  return request('/health');
}

export function readText(imageDataUrl, language) {
  return request('/ocr', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, language }),
  });
}

export function detectObjects(imageDataUrl, language, timeoutMs = 0) {
  return request('/vision/detect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, language }),
  }, timeoutMs);
}

export function describeScene(imageDataUrl, language) {
  return request('/vision/describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageDataUrl, language }),
  });
}
