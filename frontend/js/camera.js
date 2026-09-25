// =====================================================================
// camera.js – camera access and frame capture.
//
// Gets a video stream, shows it as a preview, and can grab the current
// frame as a compressed JPEG to send to the backend.
//
// Images are scaled down before sending: a 4K photo would be slow to
// upload and gives the AI no extra useful detail.
// =====================================================================

const MAX_WIDTH = 1024;
const JPEG_QUALITY = 0.8;

const video = document.getElementById('camera');
const placeholder = document.getElementById('camera-placeholder');

let stream = null;

export function isOn() {
  return stream !== null;
}

export async function start() {
  if (stream) return;

  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('cameraMissing');
    error.code = 'cameraMissing';
    throw error;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',   // rear camera on phones
        width: { ideal: 1280 },
      },
      audio: false,
    });
  } catch (cause) {
    // Translate the browser's technical name into something we can speak.
    const denied = cause.name === 'NotAllowedError' || cause.name === 'SecurityError';
    const error = new Error(denied ? 'cameraDenied' : 'cameraMissing');
    error.code = denied ? 'cameraDenied' : 'cameraMissing';
    throw error;
  }

  video.srcObject = stream;
  video.hidden = false;
  placeholder.hidden = true;

  // Wait until the first frame exists, otherwise capture() returns black.
  if (video.readyState < 2) {
    await new Promise((resolve) => video.addEventListener('loadeddata', resolve, { once: true }));
  }
}

export function stop() {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
  stream = null;
  video.srcObject = null;
  video.hidden = true;
  placeholder.hidden = false;
}

// Grab the current frame as a data URL, scaled down and compressed.
export function capture() {
  if (!stream) throw new Error('cameraOff');

  const scale = Math.min(1, MAX_WIDTH / video.videoWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);

  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
