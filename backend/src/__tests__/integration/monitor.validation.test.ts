import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import jwt from 'jsonwebtoken';

describe('Monitor Validation Integration Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user
    const testUser = await prisma.user.create({
      data: {
        email: `test${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        name: 'Test User',
      },
    });
    testUserId = testUser.id;

    // Generate auth token
    const secret = process.env.JWT_SECRET!;
    authToken = jwt.sign({ userId: testUserId }, secret, { expiresIn: '1h' });
  });

  afterAll(async () => {
    // Cleanup
    await prisma.monitor.deleteMany({ where: { userId: testUserId } });
    await prisma.subscription.deleteMany({ where: { userId: testUserId } });
    await prisma.user.delete({ where: { id: testUserId } });
    await prisma.$disconnect();
  });

  describe('POST /api/monitors', () => {
    it('should reject invalid URL format', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'invalid-url',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('http://');
    });

    it('should reject URL without protocol', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'example.com/search',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('http://');
    });

    it('should reject URL with spaces', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://example .com/search',
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('espaços');
    });

    it('should accept valid URL', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://example.com/search',
        });

      // Should succeed or fail due to plan limits, not validation
      expect([201, 403]).toContain(response.status);
    });
  });

  describe('PUT /api/monitors/:id', () => {
    it('should reject invalid URL in update', async () => {
      // Create a monitor first (skip if no subscription)
      const createResponse = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://example.com/search',
        });

      if (createResponse.status === 201) {
        const monitorId = createResponse.body.data.id;

        const response = await request(app)
          .put(`/api/monitors/${monitorId}`)
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            searchUrl: 'invalid-url',
          });

        expect(response.status).toBe(400);
        expect(response.body.message).toContain('http://');
      }
    });
  });
});
