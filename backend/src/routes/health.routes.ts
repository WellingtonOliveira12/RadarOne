import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /api/health/version
 * Retorna informações de versão e build para evidência de deploy
 */
router.get('/version', (_req: Request, res: Response) => {
  res.json({
    service: 'RadarOne Backend',
    commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || 'local-dev',
    branch: process.env.RENDER_GIT_BRANCH || 'unknown',
    buildTime: process.env.BUILD_TIME || new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/health (health check básico)
 */
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
