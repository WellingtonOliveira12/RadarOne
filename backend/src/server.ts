import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Carrega variáveis de ambiente
dotenv.config();

// Inicializa o Prisma Client
export const prisma = new PrismaClient({
  log: ['error', 'warn'], // só para termos algo explícito nas opções
});

// Importa rotas
import authRoutes from './routes/auth.routes';
import monitorRoutes from './routes/monitorRoutes';
// import userRoutes from './routes/user.routes';
// import planRoutes from './routes/plan.routes';
// import subscriptionRoutes from './routes/subscription.routes';
// import couponRoutes from './routes/coupon.routes';
// import webhookRoutes from './routes/webhook.routes';

const app: Application = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARES
// ============================================

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
// app.use('/api/users', userRoutes);
// app.use('/api/plans', planRoutes);
// app.use('/api/subscriptions', subscriptionRoutes);
// app.use('/api/coupons', couponRoutes);
// app.use('/api/webhooks', webhookRoutes);

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

    // Inicia o servidor
    app.listen(PORT, () => {
      console.log(`🚀 Servidor rodando na porta ${PORT}`);
      console.log(`🌍 Ambiente: ${process.env.NODE_ENV}`);
      console.log(`📍 URL: http://localhost:${PORT}`);
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
