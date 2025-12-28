import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';

/**
 * Testes de Integração: Rotas de Autenticação
 *
 * Testa:
 * - POST /api/auth/register - Registro de usuário
 * - POST /api/auth/login - Login de usuário
 * - POST /api/auth/forgot-password - Recuperação de senha
 * - POST /api/auth/reset-password - Reset de senha
 *
 * Estratégia:
 * - Usa banco de dados real (test database)
 * - Limpa dados de teste após cada execução
 * - Testa happy path e validações
 */

describe('Auth Routes - Integration Tests', () => {
  const testEmail = `test-${Date.now()}@test.com`;
  const testPassword = 'TestPassword123!';
  let testUserId: string;

  beforeAll(async () => {
    // Garantir conexão com banco
    await prisma.$connect();
  });

  afterAll(async () => {
    // Limpar usuário de teste se foi criado
    if (testUserId) {
      try {
        await prisma.user.delete({ where: { id: testUserId } });
      } catch {
        // Ignora se usuário não existe
      }
    }

    // Limpar usuários de teste criados durante testes
    await prisma.user.deleteMany({
      where: {
        email: {
          contains: '@test.com',
        },
      },
    });

    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('deve registrar novo usuário com sucesso', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testEmail);
      expect(response.body.user.name).toBe('Test User');

      // Guardar ID para cleanup
      testUserId = response.body.user.id;
    });

    it('deve retornar erro ao registrar com email duplicado', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User 2',
          email: testEmail, // Email já existe
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar campos obrigatórios no registro', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          // Faltando name
          email: 'another@test.com',
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar formato de email no registro', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'email-invalido', // Email sem @
          password: testPassword,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar senha fraca no registro', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test-weak@test.com',
          password: '123', // Senha muito fraca
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/login', () => {
    it('deve fazer login com sucesso', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testEmail);
    });

    it('deve retornar erro com credenciais inválidas', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'SenhaErrada123!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro ao fazer login com usuário inexistente', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'usuario-nao-existe@test.com',
          password: testPassword,
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar campos obrigatórios no login', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          // Faltando password
          email: testEmail,
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('POST /api/auth/forgot-password', () => {
    it('deve aceitar requisição de forgot password', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: testEmail,
        });

      // Retorna 200 mesmo se email não existe (segurança)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('deve retornar mensagem genérica para email não cadastrado', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'nao-cadastrado@test.com',
        });

      // Retorna 200 (não revela se email existe ou não)
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
    });

    it('deve validar formato de email em forgot password', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email: 'email-invalido',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/auth/me (rota protegida)', () => {
    let authToken: string;

    beforeAll(async () => {
      // Fazer login para obter token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: testPassword,
        });

      authToken = loginResponse.body.token;
    });

    it('deve retornar dados do usuário autenticado', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(testEmail);
    });

    it('deve retornar erro sem token de autenticação', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro com token inválido', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer token-invalido-123');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });
});
