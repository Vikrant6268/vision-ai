// =====================================================================
// api.js – the ONLY file that talks to the backend.
//
// `request()` wraps fetch() and turns every failure into a plain-English
// Error message, because app.js will SPEAK whatever error it receives.
// A blind user must never hear "TypeError: Failed to fetch".
//
// Feature functions marked MOCK still return fake data; each is replaced
// with a real request() call in its own phase.
// =====================================================================

const API_BASE = '/api';

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(API_BASE + path, options);
  } catch {
    // Network-level failure: server not running, no connection, etc.
    throw new Error('I cannot reach the server. Please make sure Vision AI is running.');
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

// ---------- MOCK (replaced in later phases) ----------
const MOCK_DELAY_MS = 800;

function mockRequest(message) {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ ok: true, message }), MOCK_DELAY_MS);
  });
}

export function detectObjects() {
  return mockRequest('I can see a person and a chair in front of you.');
}

export function readText() {
  return mockRequest('The text says: Welcome to Vision AI.');
}

export function describeScene() {
  return mockRequest('You are in a room with a table, a laptop, and a window on the left.');
}

export function recognizePerson() {
  return mockRequest('I do not recognize this person yet.');
}
