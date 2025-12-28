import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../server';
import { prisma } from '../../server';
import jwt from 'jsonwebtoken';

describe('Subscription Middleware Tests', () => {
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Create test user WITHOUT subscription
    const testUser = await prisma.user.create({
      data: {
        email: `test-nosub-${Date.now()}@example.com`,
        passwordHash: 'dummy-hash',
        name: 'Test User No Sub',
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

  describe('User without subscription', () => {
    it('should allow access to /api/monitors for user without subscription', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`);

      // Should return 200 (empty list) instead of 403
      expect(response.status).toBe(200);
      expect(response.body.data).toBeInstanceOf(Array);
    });

    it('should allow creating monitor for user without subscription (may hit plan limit)', async () => {
      const response = await request(app)
        .post('/api/monitors')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Monitor',
          site: 'MERCADO_LIVRE',
          searchUrl: 'https://example.com/search',
        });

      // Should not return 403 for NO_SUBSCRIPTION
      // May return 403 for plan limit or 201 for success
      expect(response.status).not.toBe(403);
      if (response.status === 403) {
        expect(response.body.errorCode).not.toBe('NO_SUBSCRIPTION');
      }
    });
  });

  describe('User with TRIAL subscription', () => {
    let trialUserId: string;
    let trialAuthToken: string;

    beforeAll(async () => {
      // Create user with trial subscription
      const trialUser = await prisma.user.create({
        data: {
          email: `test-trial-${Date.now()}@example.com`,
          passwordHash: 'dummy-hash',
          name: 'Test User Trial',
        },
      });
      trialUserId = trialUser.id;

      // Create FREE plan
      const freePlan = await prisma.plan.upsert({
        where: { slug: 'free' },
        update: {},
        create: {
          name: 'FREE',
          slug: 'free',
          priceCents: 0,
          billingPeriod: 'MONTHLY',
          maxMonitors: 1,
          maxSites: 1,
          maxAlertsPerDay: 10,
        },
      });

      // Create active trial subscription
      await prisma.subscription.create({
        data: {
          user: { connect: { id: trialUserId } },
          plan: { connect: { id: freePlan.id } },
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
          queriesLimit: 100,
        },
      });

      const secret = process.env.JWT_SECRET!;
      trialAuthToken = jwt.sign({ userId: trialUserId }, secret, { expiresIn: '1h' });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.monitor.deleteMany({ where: { userId: trialUserId } });
      await prisma.subscription.deleteMany({ where: { userId: trialUserId } });
      await prisma.user.delete({ where: { id: trialUserId } });
    });

    it('should allow access for user with active TRIAL', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', `Bearer ${trialAuthToken}`);

      expect(response.status).toBe(200);
    });
  });

  describe('User with expired TRIAL subscription', () => {
    let expiredUserId: string;
    let expiredAuthToken: string;

    beforeAll(async () => {
      // Create user with expired trial
      const expiredUser = await prisma.user.create({
        data: {
          email: `test-expired-${Date.now()}@example.com`,
          passwordHash: 'dummy-hash',
          name: 'Test User Expired',
        },
      });
      expiredUserId = expiredUser.id;

      // Create FREE plan
      const freePlan = await prisma.plan.upsert({
        where: { slug: 'free' },
        update: {},
        create: {
          name: 'FREE',
          slug: 'free',
          priceCents: 0,
          billingPeriod: 'MONTHLY',
          maxMonitors: 1,
          maxSites: 1,
          maxAlertsPerDay: 10,
        },
      });

      // Create expired trial subscription
      await prisma.subscription.create({
        data: {
          user: { connect: { id: expiredUserId } },
          plan: { connect: { id: freePlan.id } },
          status: 'TRIAL',
          trialEndsAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
          queriesLimit: 100,
        },
      });

      const secret = process.env.JWT_SECRET!;
      expiredAuthToken = jwt.sign({ userId: expiredUserId }, secret, { expiresIn: '1h' });
    });

    afterAll(async () => {
      // Cleanup
      await prisma.subscription.deleteMany({ where: { userId: expiredUserId } });
      await prisma.user.delete({ where: { id: expiredUserId } });
    });

    it('should block access for user with expired TRIAL', async () => {
      const response = await request(app)
        .get('/api/monitors')
        .set('Authorization', `Bearer ${expiredAuthToken}`);

      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('TRIAL_EXPIRED');
    });
  });
});
