// =====================================================================
// Error handling – the LAST middleware in the chain.
//
// Every error becomes a JSON response with a plain-English `error`
// string, because the frontend will speak it aloud to the user.
// Internal details (stack traces, file paths) are logged here but
// never sent to the browser.
// =====================================================================

export function notFound(req, res) {
  res.status(404).json({ ok: false, error: 'That request was not understood.' });
}

// Express recognises an error handler by its FOUR parameters.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const status = err.status || 500;

  console.error(`[error] ${req.method} ${req.originalUrl} → ${status}`, err.message);

  // 4xx errors carry a message written for the user; 5xx get a safe generic one.
  const message = status < 500
    ? err.message
    : 'Something went wrong on the server. Please try again.';

  res.status(status).json({ ok: false, error: message });
}
