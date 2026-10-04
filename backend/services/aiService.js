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

// Reading text in the user's language: one request does both jobs.
//
// The model returns the page's own language alongside the text. That is
// how the app can tell the listener whether they are hearing the printed
// words or a translation, which matters for anything where wording is
// important - a medicine label, a form, a ticket.
//
// Numbers, units, names and codes are kept exactly as printed: a dose of
// "500 mg" must never be reworded.
function readPrompt(languageCode, strict = false) {
  const target = getLanguage(languageCode);

  return [
    'Read all the text in this image.',
    'In "language", give the ISO 639-1 code of the language the text is written in',
    '(for example en, hi, mr, gu), or "other" if it is none of those.',
    `In "text", give the text in ${target.name}.`,
    `If it is already in ${target.name}, copy it exactly as printed, keeping spelling and script.`,
    `Otherwise translate EVERY word into ${target.name}.`,
    'Only numbers, units, personal names, brand names and product codes stay as printed.',
    target.instruction,
    strict ? 'Your last answer left the text untranslated. Translate it fully this time.' : '',
    'Output only the text, with no explanation or commentary.',
    'If there is no readable text, return an empty string for "text".',
  ].filter(Boolean).join(' ');
}

// Has the answer really been put into the language we asked for?
// The model sometimes reports "translated" but returns the original
// words. Telling a listener "this is a translation" and then reading
// them the untranslated text would be worse than being straightforward.
const SCRIPT_OF = {
  hi: /[\u0900-\u097F]/,
  mr: /[\u0900-\u097F]/,
  gu: /[\u0A80-\u0AFF]/,
};

function isInTargetLanguage(text, languageCode) {
  if (languageCode === 'en') return !/[\u0900-\u0DFF]/.test(text);   // no Indian script left
  return SCRIPT_OF[languageCode].test(text);
}

const READ_SCHEMA = {
  type: 'OBJECT',
  properties: {
    language: { type: 'STRING' },
    text: { type: 'STRING' },
  },
  required: ['language', 'text'],
};

// One attempt. Returns { text } on success, or { retryable, error }.
async function attempt(base64Image, mimeType, languageCode, model, prompt = null, generationConfig = null) {
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
            { text: prompt ?? buildPrompt(languageCode) },
            { inline_data: { mime_type: mimeType, data: base64Image } },
          ],
        }],
        ...(generationConfig && { generationConfig }),
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

async function run(base64Image, mimeType, languageCode, prompt, generationConfig = null) {
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
    last = await attempt(base64Image, mimeType, languageCode, plan[i], prompt, generationConfig);

    if (last.text) return last.text;
    if (!last.retryable) break;

    if (i < plan.length - 1) {
      console.warn(`[gemini] ${plan[i]} unavailable, trying ${plan[i + 1]}`);
      await sleep(RETRY_DELAY_MS);
    }
  }

  throw last.error;
}

export function describeImage(base64Image, mimeType, languageCode) {
  return run(base64Image, mimeType, languageCode, null);
}

/**
 * Read the text in an image, in the user's language.
 *
 * Returns { text, translated }:
 *   text        the words to speak ('' when there was nothing to read)
 *   translated  true when the page was in a different language
 */
export async function readImageText(base64Image, mimeType, languageCode) {
  const ask = async (strict) => {
    const raw = await run(base64Image, mimeType, languageCode, readPrompt(languageCode, strict), {
      responseMimeType: 'application/json',
      responseSchema: READ_SCHEMA,
    });

    try {
      const parsed = JSON.parse(raw);
      return {
        // Collapse the line breaks in signage into one spoken line.
        text: String(parsed.text || '').replace(/\s+/g, ' ').trim(),
        source: String(parsed.language || '').toLowerCase(),
      };
    } catch {
      // The model ignored the format. Better to speak what it said than to fail.
      console.warn('[gemini] read result was not JSON');
      return { text: raw.replace(/\s+/g, ' ').trim(), source: languageCode };
    }
  };

  let result = await ask(false);

  const wasTranslated = () => result.text !== '' && result.source !== languageCode;

  // Claimed to translate but did not: ask once more, more firmly.
  if (wasTranslated() && !isInTargetLanguage(result.text, languageCode)) {
    console.warn('[gemini] translation came back untranslated, retrying');
    result = await ask(true);
  }

  // Still not translated: say so honestly. The listener hears it as the
  // printed text, not as a translation.
  if (wasTranslated() && !isInTargetLanguage(result.text, languageCode)) {
    return { text: result.text, translated: false };
  }

  return { text: result.text, translated: wasTranslated() };
}
