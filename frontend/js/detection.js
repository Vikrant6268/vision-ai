// =====================================================================
// detection.js - "what is in front of the camera?", wherever it can be
// answered.
//
// Two ways to run YOLO, chosen automatically:
//
//   server   the Python AI service, when it is running (a laptop with
//            start.bat). The tested original path.
//   device   YOLO inside this browser (onDeviceDetector.js). Used when
//            the Python service is not available - on the hosted site,
//            and so on every phone that opens the link.
//
// Both give the same result shape, and both are turned into sentences by
// the SAME code (shared/responseService.js), so the user hears identical
// wording either way.
// =====================================================================

import * as api from './api.js';
import * as camera from './camera.js';
import * as device from './onDeviceDetector.js';
import { describeDetections, buildAlert } from '/shared/responseService.js';

let mode = null;          // 'server' | 'device', decided on first use

async function chooseMode() {
  if (mode) return mode;
  const health = await api.checkHealth().catch(() => null);
  mode = health?.detectionAvailable ? 'server' : 'device';
  return mode;
}

export function currentMode() {
  return mode;
}

// Turn raw detections into the same response the server would send.
function phrase(result, language) {
  const { message, segments, warning } = describeDetections(result.objects, language);
  const alert = buildAlert(result.objects, language, result.viewBlocked, result.tooDark);

  return {
    ...result,
    message,
    segments,
    warning,
    alert: alert?.alert ?? null,
    alertKey: alert?.key ?? null,
  };
}

/**
 * Download what on-device detection needs, if it will be used. Returns
 * true when detection is ready. The first time on a phone this
 * downloads about 13 MB, so callers tell the user to wait.
 */
export async function prepare() {
  if ((await chooseMode()) === 'server') return true;
  await device.prepare();
  return true;
}

export async function needsDownload() {
  return (await chooseMode()) !== 'server' && !device.isReady();
}

/**
 * Detect objects in the current camera frame.
 * Returns { message, segments, alert, alertKey, objects, viewBlocked, ... }.
 */
export async function detect(language, timeoutMs = 0) {
  if ((await chooseMode()) === 'server') {
    try {
      return await api.detectObjects(camera.capture(), language, timeoutMs);
    } catch (error) {
      // The Python service went away (closed window, crash). Carry on
      // in the browser rather than leave the user without detection.
      console.warn('Server detection failed, switching to on-device:', error.message);
      mode = 'device';
    }
  }

  return phrase(await device.detect(camera.frame()), language);
}
