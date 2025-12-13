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

// Importa middleware de autenticação
import { authenticateToken } from './middlewares/auth.middleware';

// Importa rate limiting
import { apiRateLimiter } from './middlewares/rateLimit.middleware';

// Importa scheduler de jobs
import { startScheduler } from './jobs/scheduler';

const app: Application = express();
const PORT = Number(process.env.PORT) || 3000;

// ============================================
// MIDDLEWARES
// ============================================

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting global (120 req/min por IP)
app.use(apiRateLimiter);

// Middleware de log
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ============================================
// ROTAS
// ============================================

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'RadarOne Backend'
  });
});

// Rotas principais
app.use('/api/auth', authRoutes);
app.use('/api/monitors', monitorRoutes);
app.use('/api/plans', planRoutes); // Rota pública
app.use('/api/subscriptions', authenticateToken, subscriptionRoutes); // Protegida
app.use('/api/me', authenticateToken, userRoutes); // Protegida
app.use('/api/admin', authenticateToken, adminRoutes); // Protegida (auth + admin)
app.use('/api/dev', devRoutes); // Rotas de desenvolvimento (apenas em dev)
app.use('/api/webhooks', webhookRoutes); // Webhooks (SEM autenticação JWT - usa HMAC)
app.use('/api/coupons', couponRoutes); // Cupons (validate público, apply protegido)

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
  console.error('Erro:', err);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ============================================
// INICIALIZAÇÃO
// ============================================

const startServer = async () => {
  try {
    // Testa conexão com o banco
    await prisma.$connect();
    console.log('✅ Conectado ao banco de dados');

    // Define URL pública para produção
    const PUBLIC_URL = process.env.PUBLIC_URL || `http://localhost:${PORT}`;
    const isProduction = process.env.NODE_ENV === 'production';

    // Inicia o servidor (0.0.0.0 para aceitar conexões externas na Render)
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📍 URL: ${PUBLIC_URL}`);

      if (isProduction) {
        console.log(`🔗 Webhook Kiwify: ${PUBLIC_URL}/api/webhooks/kiwify`);
      }

      // Inicia o scheduler de jobs automáticos
      startScheduler();
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏳ Encerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n⏳ Encerrando servidor...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();

export default app;
