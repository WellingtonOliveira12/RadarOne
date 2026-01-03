import http from 'http';
import { PrismaClient } from '@prisma/client';
import { isHealthy as isRedisHealthy } from './services/queue-manager';
import { circuitBreaker } from './utils/circuit-breaker';

/**
 * Health Check HTTP Server
 *
 * Servidor HTTP simples para healthcheck do worker
 * Usado pelo Render/Docker para verificar se worker está saudável
 *
 * Endpoint: GET /health
 * Resposta: { status: 'healthy' | 'unhealthy', checks: {...} }
 */

const prisma = new PrismaClient();
const PORT = parseInt(process.env.HEALTH_CHECK_PORT || '8080');

interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  checks: {
    database: boolean;
    redis?: boolean;
    circuitBreakers?: Record<string, any>;
  };
}

const startTime = Date.now();

async function checkHealth(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {
    database: false,
    redis: undefined,
    circuitBreakers: {},
  };

  // Check database
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = true;
  } catch (error) {
    checks.database = false;
  }

  // Check Redis (se usar fila)
  if (process.env.REDIS_URL || process.env.REDIS_HOST) {
    try {
      checks.redis = await isRedisHealthy();
    } catch (error) {
      checks.redis = false;
    }
  }

  // Circuit breaker stats
  try {
    const stats = circuitBreaker.getAllStats();
    const cbStats: Record<string, any> = {};

    stats.forEach((state, domain) => {
      cbStats[domain] = {
        state: state.state,
        failures: state.failures,
        totalFailures: state.totalFailures,
        totalSuccesses: state.totalSuccesses,
      };
    });

    checks.circuitBreakers = cbStats;
  } catch (error) {
    // Ignore
  }

  // Overall status
  const isHealthy = checks.database && (checks.redis === undefined || checks.redis === true);

  return {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: Date.now() - startTime,
    checks,
  };
}

export function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/health' && req.method === 'GET') {
      const health = await checkHealth();

      res.statusCode = health.status === 'healthy' ? 200 : 503;
      res.end(JSON.stringify(health, null, 2));
    } else if (req.url === '/ping' && req.method === 'GET') {
      // Simple ping
      res.statusCode = 200;
      res.end(JSON.stringify({ status: 'pong' }));
    } else {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    }
  });

  server.listen(PORT, () => {
    console.log(`🏥 Health check server listening on port ${PORT}`);
    console.log(`   - GET /health - Detailed health status`);
    console.log(`   - GET /ping - Simple ping`);
  });

  return server;
}
