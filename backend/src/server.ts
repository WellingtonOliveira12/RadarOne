import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// Carrega variáveis de ambiente
dotenv.config();

// Inicializa Sentry para monitoramento de erros
import { initSentry } from './monitoring/sentry';
initSentry();

// Inicializa o Prisma Client com adapter Postgres
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
export const prisma = new PrismaClient({
  adapter,
  log: ['error', 'warn'],
});

// Importa rotas
import authRoutes from './routes/auth.routes';
import monitorRoutes from './routes/monitorRoutes';
import userRoutes from './routes/user.routes';
import planRoutes from './routes/plan.routes';
import subscriptionRoutes from './routes/subscription.routes';
import devRoutes from './routes/dev.routes';
import webhookRoutes from './routes/webhook.routes';
import adminRoutes from './routes/admin.routes';
import couponRoutes from './routes/coupon.routes';
import notificationRoutes from './routes/notification.routes';
import telegramRoutes from './routes/telegram.routes';
import supportRoutes from './routes/support.routes';

// Importa controller do Telegram (para handler de debug explícito)
import { TelegramController } from './controllers/telegram.controller';

// Importa middleware de autenticação
import { authenticateToken } from './middlewares/auth.middleware';

// Importa rate limiting
import { apiRateLimiter } from './middlewares/rateLimit.middleware';

// Importa middleware de requestId
import { requestIdMiddleware } from './middlewares/requestId.middleware';

// Importa logger
import logger from './logger';

// Importa scheduler de jobs
import { startScheduler } from './jobs/scheduler';

const app: Application = express();
const PORT = Number(process.env.PORT) || 3000;

// ============================================
// CONFIGURAÇÃO DE PROXY (RENDER/PRODUÇÃO)
// ============================================
// CRÍTICO: Deve vir ANTES de qualquer middleware
// Necessário para rate-limit funcionar corretamente com X-Forwarded-For
app.set('trust proxy', 1);

// ============================================
// MIDDLEWARES
// ============================================

// CORS: aceitar múltiplas origens (produção + desenvolvimento)
const allowedOrigins = [
  'https://radarone-frontend.onrender.com',  // Frontend público (Render)
  'https://radarone.com.br',                 // Domínio custom principal
  'https://www.radarone.com.br',             // Domínio custom com www
  'http://localhost:5173',                   // Dev (Vite)
  'http://localhost:3000',                   // Dev (caso use outra porta)
  'http://localhost',                        // Dev (Docker)
  process.env.FRONTEND_URL,                  // Custom domain adicional (se configurado)
].filter(Boolean); // Remove undefined/null

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sem origem (ex: Postman, curl, server-side)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origem ${origin} não permitida`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting global (120 req/min por IP)
app.use(apiRateLimiter);

// Middleware de requestId e logging estruturado
app.use(requestIdMiddleware);

// ============================================
// ROTAS
// ============================================

// ============================================
// ROTAS DE STATUS E HEALTH CHECK
// ============================================

// Rota raiz - evita 404 desnecessário
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'RadarOne API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Health check detalhado (JSON)
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'RadarOne Backend'
  });
});

// Health check simples para Render (texto puro)
app.get('/healthz', (req: Request, res: Response) => {
  res.status(200).send('ok');
});

// ============================================
// ENDPOINTS DE DIAGNÓSTICO
// ============================================

// Endpoint de meta informações (público) - mostra versão e commit rodando
app.get('/api/_meta', (req: Request, res: Response) => {
  res.json({
    service: 'RadarOne API',
    version: '1.0.1', // Incrementado para provar rebuild
    timestamp: new Date().toISOString(),
    gitSha: process.env.RENDER_GIT_COMMIT || process.env.GIT_SHA || 'unknown',
    nodeEnv: process.env.NODE_ENV || 'development',
    nodeVersion: process.version,
    platform: process.platform
  });
});

// Endpoint para listar rotas registradas (apenas em desenvolvimento ou com token)
app.get('/api/_routes', (req: Request, res: Response) => {
  // Proteção: apenas em desenvolvimento OU com header de admin
  const isDev = process.env.NODE_ENV !== 'production';
  const adminToken = req.get('x-admin-token');
  const validAdminToken = process.env.ADMIN_DEBUG_TOKEN || 'debug-token-change-me';

  if (!isDev && adminToken !== validAdminToken) {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  // Listar todas as rotas registradas no Express
  const routes: any[] = [];

  app._router.stack.forEach((middleware: any) => {
    if (middleware.route) {
      // Rotas diretas
      const methods = Object.keys(middleware.route.methods).map(m => m.toUpperCase());
      routes.push({
        methods,
        path: middleware.route.path
      });
    } else if (middleware.name === 'router') {
      // Sub-routers
      middleware.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).map(m => m.toUpperCase());
          const basePath = middleware.regexp.source
            .replace('\\/?', '')
            .replace('(?=\\/|$)', '')
            .replace(/\\\//g, '/')
            .replace(/\^/g, '')
            .replace(/\$/g, '')
            .replace(/\?\(\?=/g, '');

          routes.push({
            methods,
            path: basePath + handler.route.path
          });
        }
      });
    }
  });

  res.json({
    totalRoutes: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ROTAS PRINCIPAIS
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/plans', planRoutes); // Rota pública
app.use('/api/subscriptions', authenticateToken, subscriptionRoutes); // Protegida
app.use('/api/me', authenticateToken, userRoutes); // Protegida
app.use('/api/admin', authenticateToken, adminRoutes); // Protegida (auth + admin)
app.use('/api/dev', devRoutes); // Rotas de desenvolvimento (apenas em dev)
app.use('/api/webhooks', webhookRoutes); // Webhooks (SEM autenticação JWT - usa HMAC)
app.use('/api/telegram', telegramRoutes); // Telegram webhook (SEM JWT - usa secret)

// ============================================
// DEBUG: Handler explícito temporário para webhook do Telegram
// Este handler garante que /api/telegram/webhook sempre responda
// Se este handler funcionar mas o router não, significa que telegramRoutes não está sendo carregado
// REMOVER após confirmar que router está funcionando
// ============================================
app.post('/api/telegram/webhook', (req: Request, res: Response, next: NextFunction) => {
  // Log para confirmar que o handler explícito foi chamado
  logger.info({
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'content-type': req.get('content-type'),
      'user-agent': req.get('user-agent')
    }
  }, 'DEBUG: Hit explicit /api/telegram/webhook handler (BYPASS)');

  // Se chegou aqui, significa que o problema foi o router não estar montado
  // Chama o controller diretamente
  TelegramController.handleWebhook(req, res).catch(next);
});

app.use('/api/coupons', couponRoutes); // Cupons (validate público, apply protegido)
app.use('/api/notifications', authenticateToken, notificationRoutes); // Configurações de notificações (protegido)
app.use('/api/support', supportRoutes); // Tickets de suporte (criar ticket é público)

// Rota de teste
app.get('/api/test', (req: Request, res: Response) => {
  res.json({
    message: 'RadarOne API está funcionando!',
    version: '1.0.0'
  });
});

// ============================================
// ERROR HANDLING
// ============================================

// Rota não encontrada
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Rota não encontrada',
    path: req.path
  });
});

// Handler de erros global
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  const requestLogger = req.logger || logger;
  requestLogger.error({
    err,
    requestId: req.requestId,
    method: req.method,
    url: req.url,
  }, 'Unhandled error');

  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    requestId: req.requestId,
  });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

const startServer = async () => {
  try {
    // Testa conexão com o banco
    await prisma.$connect();
    logger.info('Database connected successfully');

    // Define URL pública para produção
    const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    const isProduction = process.env.NODE_ENV === 'production';

    // Inicia o servidor (0.0.0.0 para aceitar conexões externas na Render)
    app.listen(PORT, '0.0.0.0', () => {
      logger.info({
        port: PORT,
        env: process.env.NODE_ENV || 'development',
        url: PUBLIC_URL,
        webhookUrl: isProduction ? `${PUBLIC_URL}/api/webhooks/kiwify` : undefined,
      }, 'Server started successfully');

      // Inicia o scheduler de jobs automáticos
      startScheduler();
    });
  } catch (error) {
    logger.error({ err: error }, 'Failed to start server');
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down server (SIGINT)...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down server (SIGTERM)...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

export default app;
