// =====================================================================
// GET /api/health – "is the server alive?"
// The frontend calls this on startup so it can TELL the user (aloud)
// if the backend isn't running, instead of silently failing later.
// =====================================================================

import { Router } from 'express';
import { isAvailable } from '../services/pythonService.js';

const router = Router();

router.get('/', async (req, res) => {
  res.json({
    ok: true,
    service: 'vision-ai-backend',
    uptimeSeconds: Math.round(process.uptime()),
    // Tells the UI which features are usable right now.
    detectionAvailable: await isAvailable(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
