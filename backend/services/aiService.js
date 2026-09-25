// =====================================================================
// aiService.js – the ONLY file that knows about Gemini.
//
// Everything else calls describeImage() and gets back a plain sentence.
// If we ever switch provider (OpenAI, Claude, a local model), this is
// the single file that changes.
//
// The API key is read here on the server and never sent to the browser.
// =====================================================================

import { config } from '../config/env.js';
import { getLanguage } from '../config/languages.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 10000;
const RETRY_DELAY_MS = 800;

// Errors whose message is safe to SPEAK to the user carry `expose = true`
// so middleware/errorHandler.js passes the wording through unchanged.
function userError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Build the instruction we send with the photo.
// Short answers matter: the user LISTENS to this, and a long paragraph
// is hard to follow and slow to speak.
function buildPrompt(languageCode) {
  const language = getLanguage(languageCode);
  return [
    'You are assisting a person who cannot see.',
    'Describe this photo in at most two short sentences.',
    'Mention the most important objects, people, and obstacles, and where they are',
    '(left, centre, or right).',
    'Be factual. Do not guess distances. Do not mention that this is a photo.',
    language.instruction,
  ].join(' ');
}

// One attempt. Returns { text } on success, or { retryable, error }.
async function attempt(base64Image, mimeType, languageCode, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: buildPrompt(languageCode) },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        }],
      }),
    });
  } catch (cause) {
    const timedOut = cause.name === 'AbortError';
    console.error('[gemini] request failed:', cause.name, cause.cause?.code || '');
    return {
      retryable: true,
      error: userError(
        timedOut
          ? 'The AI service took too long to answer. Please try again.'
          : 'I cannot reach the AI service. Please check your internet connection.',
        504,
      ),
    };
  } finally {
    clearTimeout(timer);
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error('[gemini]', response.status, data?.error?.message || '');

    // 429 = our quota; 500/503 = Google is overloaded. Both worth retrying.
    if (response.status === 429 || response.status >= 500) {
      return {
        retryable: true,
        error: userError('The AI service is busy. Please try again in a moment.', 503),
      };
    }
    if (response.status === 400 || response.status === 403) {
      return {
        retryable: false,
        error: userError('The AI key is not working. Please check the server settings.', 502),
      };
    }
    return {
      retryable: false,
      error: userError('The AI service could not describe the picture. Please try again.', 502),
    };
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

  if (!text) {
    return {
      retryable: false,
      error: userError('I could not understand that picture. Please try again.', 502),
    };
  }

  return { text };
}

export async function describeImage(base64Image, mimeType, languageCode) {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') {
    throw userError('Scene description is not set up on this server.', 503);
  }

  // Try the fast model first; if Google reports it overloaded, fall back
  // to a second model rather than making the user wait and retry.
  // A user who cannot see the screen should not have to guess that
  // pressing the button again would have worked.
  const plan = [config.geminiModel, config.geminiFallbackModel];
  let last;

  for (let i = 0; i < plan.length; i++) {
    last = await attempt(base64Image, mimeType, languageCode, plan[i]);

    if (last.text) return last.text;
    if (!last.retryable) break;

    if (i < plan.length - 1) {
      console.warn(`[gemini] ${plan[i]} unavailable, trying ${plan[i + 1]}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw last.error;
}
