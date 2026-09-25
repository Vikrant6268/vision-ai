// =====================================================================
// GET /api/health – "is the server alive?"
// The frontend calls this on startup so it can TELL the user (aloud)
// if the backend isn't running, instead of silently failing later.
// =====================================================================

import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    ok: true,
    service: 'vision-ai-backend',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

export default router;
