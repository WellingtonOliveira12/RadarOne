import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';

describe('Auth Validation Integration Tests', () => {
  afterAll(async () => {
    // Cleanup
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid-email',
          password: 'Password123',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });

    it('should reject weak password (no numbers)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'weakpassword',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('número');
    });

    it('should reject weak password (too short)', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: 'Pass1',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('8 caracteres');
    });

    it('should reject weak password "123"', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test@example.com',
          password: '123',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it('should normalize email to lowercase', async () => {
      const testEmail = `TEST${Date.now()}@EXAMPLE.COM`;
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          password: 'Password123',
          name: 'Test User',
        });

      // Should create user successfully
      expect([201, 409]).toContain(response.status);

      if (response.status === 201) {
        expect(response.body.user.email).toBe(testEmail.toLowerCase());

        // Cleanup
        await prisma.user.delete({
          where: { email: testEmail.toLowerCase() },
        });
      }
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'Password123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('email');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reject weak password', async () => {
      const response = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: 'fake-token',
          password: '123',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });
});
