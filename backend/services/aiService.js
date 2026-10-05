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
import { isInLanguage } from './languageDetect.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 10000;
const READ_TIMEOUT_MS = 20000;      // a full page of text takes longer
// If a model has not answered within this long, the next model is asked
// as well and whichever answers first is used (a "hedged request").
// Gemini's speed varies through the day: in testing the same model took
// 1.6s at one time and 8.7s at another, while the others answered in
// 3-4s. Read Text makes two calls in a row, so one slow model doubled
// the wait. Extra quota is used only when a model is being slow.
const HEDGE_AFTER_MS = 3500;

// Errors whose message is safe to SPEAK to the user carry `expose = true`
// so middleware/errorHandler.js passes the wording through unchanged.
function userError(message, status) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

// When Google says a model is over its quota it also says when to come
// back ("Please retry in 57s"). Until then that model is skipped, so the
// user does not wait for a request we already know will be refused.
const restingUntil = new Map();

function retryDelayMs(data) {
  const info = (data?.error?.details || []).find((d) => d.retryDelay);
  const seconds = parseFloat(info?.retryDelay ?? '');
  return Number.isFinite(seconds) ? seconds * 1000 : 60000;
}

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

// Step 1 of Read Text: copy the words exactly. Translation is a
// separate step (see translateText), so each prompt does one job and the
// app - not the model - decides whether translation is needed.
const OCR_PROMPT = [
  'Read all the text in this image exactly as printed.',
  'Output only the text itself, with no explanation and no translation.',
  'Preserve the original script and spelling.',
  'If there is no readable text, output exactly: NO_TEXT',
].join(' ');

function translatePrompt(text, languageCode, strict) {
  const target = getLanguage(languageCode);
  const instructions = [
    `Translate the following text into ${target.name}.`,
    'Translate every word. Only numbers, units, personal names, brand names and',
    'product codes stay exactly as written.',
    target.instruction,
    strict && 'Your previous answer was not fully translated. Translate all of it this time.',
    'Output only the translation, with no explanation and no commentary.',
  ].filter(Boolean).join(' ');

  return `${instructions}\n\nText:\n${text}`;
}

// One attempt. Returns { text } on success, or { retryable, error }.
async function attempt(base64Image, mimeType, languageCode, model, prompt = null, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Text-only requests (translation) send no image.
  const parts = [{ text: prompt ?? buildPrompt(languageCode) }];
  if (base64Image) parts.push({ inline_data: { mime_type: mimeType, data: base64Image } });

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
        contents: [{ parts }],
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

    // 429 = this model's quota is used up; rest it, try the next model.
    if (response.status === 429) {
      restingUntil.set(model, Date.now() + retryDelayMs(data));
      return {
        retryable: true,
        error: userError('The AI service is busy. Please try again in a moment.', 503),
      };
    }

    // 404 = this model has been retired. 500/503 = Google is overloaded.
    // Either way another model may well answer.
    if (response.status === 404 || response.status >= 500) {
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

async function run(base64Image, mimeType, languageCode, prompt, timeoutMs = TIMEOUT_MS) {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') {
    throw userError('Scene description is not set up on this server.', 503);
  }

  // Skip any model Google has told us to rest. If every model is resting,
  // try them anyway rather than give up.
  const now = Date.now();
  const ready = config.geminiModels.filter((m) => (restingUntil.get(m) ?? 0) <= now);
  const plan = ready.length ? ready : config.geminiModels;

  // Hedged requests. Start the first model; if it fails, or is still
  // silent after HEDGE_AFTER_MS, start the next one too. The first good
  // answer wins. A user who cannot see the screen should not wait for a
  // slow model when a faster one is available.
  return new Promise((resolve, reject) => {
    let next = 0;
    let running = 0;
    let done = false;
    let lastError = null;
    let hedgeTimer = null;

    const finish = (callback, value) => {
      done = true;
      clearTimeout(hedgeTimer);
      callback(value);
    };

    const launch = () => {
      if (done || next >= plan.length) return;

      const model = plan[next];
      next += 1;
      running += 1;

      clearTimeout(hedgeTimer);
      hedgeTimer = setTimeout(() => {
        if (next < plan.length) console.warn(`[gemini] ${model} is slow, also asking ${plan[next]}`);
        launch();
      }, HEDGE_AFTER_MS);

      attempt(base64Image, mimeType, languageCode, model, prompt, timeoutMs).then((result) => {
        running -= 1;
        if (done) return;                        // another model already answered

        if (result.text) return finish(resolve, result.text);

        lastError = result.error;
        if (!result.retryable) return finish(reject, result.error);   // e.g. a bad key

        if (next < plan.length) {
          console.warn(`[gemini] ${model} unavailable, trying ${plan[next]}`);
          launch();
        } else if (running === 0) {
          finish(reject, lastError);             // every model has failed
        }
      });
    };

    launch();
  });
}

export function describeImage(base64Image, mimeType, languageCode) {
  return run(base64Image, mimeType, languageCode, null);
}

// Collapse the line breaks in signage and pages into one spoken line.
const oneLine = (text) => String(text || '').replace(/\s+/g, ' ').trim();

/**
 * Step 1 of Read Text: the exact printed words, or '' if there are none.
 */
export async function readImageText(base64Image, mimeType) {
  const text = await run(base64Image, mimeType, 'en', OCR_PROMPT, READ_TIMEOUT_MS);
  return text === 'NO_TEXT' ? '' : oneLine(text);
}

/**
 * Step 3 of Read Text: translate already-extracted text.
 *
 * Text only, no image, so it is quick and cheap. The result is checked
 * (step 4); a translation that is still in the wrong language is asked
 * for once more, and if it fails again we throw rather than pass off the
 * original as a translation.
 */
export async function translateText(text, languageCode) {
  for (const strict of [false, true]) {
    const result = oneLine(await run(null, null, languageCode, translatePrompt(text, languageCode, strict)));

    if (result && isInLanguage(result, languageCode)) return result;

    console.warn(`[gemini] translation into ${languageCode} came back in the wrong language`);
  }

  throw userError('I could not translate this text.', 502);
}
