import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import { createAuthedUserWithActiveTrial, cleanupTestUser } from '../helpers/auth';

/**
 * Testes de Integração: Rotas de Monitores
 *
 * Testa:
 * - GET /api/monitors - Listar monitores do usuário
 * - POST /api/monitors - Criar monitor
 * - PUT /api/monitors/:id - Atualizar monitor
 * - DELETE /api/monitors/:id - Deletar monitor
 *
 * Estratégia:
 * - Usa banco de dados real (test database)
 * - Cria usuário com trial ativo para passar no middleware checkTrialExpired
 * - Limpa dados após execução
 */

describe('Monitor Routes - Integration Tests', () => {
  let authToken: string;
  let userId: string;
  let monitorId: string;

  beforeAll(async () => {
    await prisma.$connect();

    // Criar usuário autenticado com trial ativo (passa no middleware checkTrialExpired)
    const authedUser = await createAuthedUserWithActiveTrial();
    authToken = authedUser.token;
    userId = authedUser.userId;
  });

  afterAll(async () => {
    // Limpar usuário de teste e suas dependências
    await cleanupTestUser(userId);
    await prisma.$disconnect();
  });

  describe('POST /api/monitors', () => {
    it('deve criar monitor com sucesso', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Monitor de Teste',
          site: 'MERCADO_LIVRE',
          mode: 'PRICE_DROP',
          searchUrl: 'https://lista.mercadolivre.com.br/notebook',
          active: true,
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.name).toBe('Monitor de Teste');
      expect(response.body.data.site).toBe('MERCADO_LIVRE');

      // Guardar ID para outros testes
      monitorId = response.body.data.id;
    });

    it('deve validar campos obrigatórios ao criar monitor', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          // Faltando name
          site: 'OLX',
          mode: 'NEW_LISTINGS',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar site inválido ao criar monitor', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Monitor Inválido',
          site: 'SITE_INEXISTENTE',
          mode: 'PRICE_DROP',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve validar URL inválida ao criar monitor', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Monitor URL Inválida',
          site: 'MERCADO_LIVRE',
          mode: 'PRICE_DROP',
          searchUrl: 'url-sem-protocolo',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve requerer autenticação para criar monitor', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .send({
          name: 'Monitor Sem Auth',
          site: 'MERCADO_LIVRE',
          mode: 'PRICE_DROP',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/monitors', () => {
    it('deve listar monitores do usuário autenticado', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('deve retornar apenas monitores do usuário autenticado', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      // Todos os monitores devem pertencer ao usuário
      response.body.data.forEach((monitor: any) => {
        expect(monitor.userId).toBe(userId);
      });
    });

    it('deve requerer autenticação para listar monitores', async () => {
      const response = await request(app).get('/api/monitors');

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('PUT /api/monitors/:id', () => {
    it('deve atualizar monitor com sucesso', async () => {
      const response = await request(app)
        .put(`/api/monitors/${monitorId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Monitor Atualizado',
          active: false,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body.data.name).toBe('Monitor Atualizado');
      expect(response.body.data.active).toBe(false);
    });

    it('deve validar campos ao atualizar monitor', async () => {
      const response = await request(app)
        .put(`/api/monitors/${monitorId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          site: 'SITE_INVALIDO',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro ao atualizar monitor de outro usuário', async () => {
      // Criar outro usuário com trial ativo
      const otherUser = await createAuthedUserWithActiveTrial();

      // Tentar atualizar monitor do primeiro usuário
      const response = await request(app)
        .put(`/api/monitors/${monitorId}`)
        .set('Authorization', `Bearer ${otherUser.token}`)
        .send({
          name: 'Tentativa de Atualizar Monitor Alheio',
        });

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');

      // Limpar outro usuário
      await cleanupTestUser(otherUser.userId);
    });

    it('deve requerer autenticação para atualizar monitor', async () => {
      const response = await request(app)
        .put(`/api/monitors/${monitorId}`)
        .send({
          name: 'Sem Auth',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/monitors/:id', () => {
    it('deve deletar monitor com sucesso', async () => {
      // Criar monitor para deletar
      const createResponse = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Monitor Para Deletar',
          site: 'OLX',
          searchUrl: 'https://www.olx.com.br/estado-sp/regiao-de-sao-paulo',
        });

      const monitorToDelete = createResponse.body.data.id;

      // Deletar
      const response = await request(app)
        .delete(`/api/monitors/${monitorToDelete}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');

      // Verificar que foi deletado
      const monitor = await prisma.monitor.findUnique({
        where: { id: monitorToDelete },
      });

      expect(monitor).toBeNull();
    });

    it('deve retornar erro ao deletar monitor inexistente', async () => {
      const response = await request(app)
        .delete('/api/monitors/id-inexistente-123')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro ao deletar monitor de outro usuário', async () => {
      // Criar outro usuário com trial ativo
      const otherUser = await createAuthedUserWithActiveTrial();

      // Tentar deletar monitor do primeiro usuário
      const response = await request(app)
        .delete(`/api/monitors/${monitorId}`)
        .set('Authorization', `Bearer ${otherUser.token}`);

      expect(response.status).toBe(403);
      expect(response.body).toHaveProperty('error');

      // Limpar outro usuário
      await cleanupTestUser(otherUser.userId);
    });

    it('deve requerer autenticação para deletar monitor', async () => {
      const response = await request(app).delete(`/api/monitors/${monitorId}`);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });
  });
});
