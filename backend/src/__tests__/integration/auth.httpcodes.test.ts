import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';

describe('Auth HTTP Status Codes', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Token Authentication - Status 401', () => {
    it('should return 401 when token is not provided', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Token não fornecido');
    });

    it('should return 401 when token is invalid', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('inválido ou expirado');
    });

    it('should return 401 when token is malformed', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
    });
  });

  describe('Protected Routes - Status 401', () => {
    it('should return 401 for /api/monitors without token', async () => {
      const response = await request(app).get('/api/monitors');

      expect(response.status).toBe(401);
    });

    it('should return 401 for /api/monitors with invalid token', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });
});
