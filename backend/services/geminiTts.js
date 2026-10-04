// =====================================================================
// geminiTts.js – speech from Gemini, kept as the LAST-RESORT voice.
//
// It sounds good, but the free tier allows only 10 speech requests per
// day PER MODEL (quota GenerateRequestsPerDayPerProjectPerModel-FreeTier,
// limit 10), and a single 440-character text took 133 seconds. That
// rules it out as the main voice for an app that speaks constantly, so
// it is only tried after Edge's voices have failed.
// =====================================================================

import { config } from '../config/env.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 15000;

async function callModel(model, text) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': config.geminiApiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: config.ttsVoice } },
          },
        },
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error('[gemini-tts]', model, response.status, data?.error?.message || '');
      return null;
    }

    const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (!part?.data) return null;

    return { audio: Buffer.from(part.data, 'base64'), mimeType: part.mimeType || 'audio/wav' };
  } catch (cause) {
    console.error('[gemini-tts]', model, 'request failed:', cause.name);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Try each configured Gemini speech model in turn. Quota is per model,
 * so one exhausted model must not stop the next from being tried.
 */
export async function synthesize(text) {
  if (!config.geminiApiKey || config.geminiApiKey === 'your_key_here') return null;

  for (const model of [config.ttsModel, config.ttsFallbackModel]) {
    const result = await callModel(model, text);
    if (result) return result;
  }

  return null;
}
