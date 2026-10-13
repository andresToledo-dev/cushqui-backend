import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { getSharedTestApp, getAccessToken, closeSharedTestApp } from './shared-test.module';

describe('Auth Flow (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await getSharedTestApp();
    accessToken = getAccessToken();
  });

  afterAll(async () => {
    await closeSharedTestApp();
  });

  describe('Auth flow: login -> token -> GET categories', () => {
    it('should login with seed user and get access token', () => {
      // getSharedTestApp already logs in and stores the token
      // This test just verifies we have a valid token
      expect(accessToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(accessToken.length).toBeGreaterThan(0);
    });

    it('should use the access token to GET categories (requires auth)', () => {
      return request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          // Verify categories have expected structure
          const category = res.body[0];
          expect(category).toHaveProperty('id');
          expect(category).toHaveProperty('name');
          expect(category).toHaveProperty('icon');
          expect(category).toHaveProperty('color');
          expect(category).toHaveProperty('userId');
          expect(category).toHaveProperty('createdAt');
          expect(category).toHaveProperty('updatedAt');
        });
    });

    it('should return 401 when accessing categories without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/categories')
        .expect(401);
    });

    it('should return 401 when accessing categories with invalid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('Auth endpoints (public)', () => {
    it('should register a new user with unique email', () => {
      const uniqueEmail = `flow-test-${Date.now()}@example.com`;
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail,
          password: 'Password123!',
          name: 'Flow Test User',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
        });
    });

    it('should login with valid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@cushqui.local',
          password: 'Password123!',
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('accessToken');
          expect(res.body).toHaveProperty('refreshToken');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          email: 'test@cushqui.local',
          password: 'WrongPassword123!',
        })
        .expect(401);
    });

    it('should access /auth/me with valid token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body).toHaveProperty('email', 'test@cushqui.local');
          expect(res.body).not.toHaveProperty('passwordHash');
        });
    });

    it('should return 401 for /auth/me without token', () => {
      return request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });
  });
});