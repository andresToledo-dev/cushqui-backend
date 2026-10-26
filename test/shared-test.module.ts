import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ConfigService } from '@nestjs/config';

// Load env variables
require('dotenv').config({ path: '.env' });

let appInstance: INestApplication;
let accessTokenInstance: string;
let moduleInstance: TestingModule;

export async function getSharedTestApp(): Promise<INestApplication> {
  if (appInstance) return appInstance;

  moduleInstance = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  appInstance = moduleInstance.createNestApplication();
  
  const configService = appInstance.get(ConfigService);
  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api/v1';
  
  appInstance.setGlobalPrefix(apiPrefix);
  appInstance.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );
  
  await appInstance.init();

  // Login with seed user to get access token
  const loginRes = await request(appInstance.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: 'test@cushqui.local',
      password: 'Password123!',
    });

  if (loginRes.status !== 200 || !loginRes.body.accessToken) {
    throw new Error(`Failed to login with seed user: ${JSON.stringify(loginRes.body)}`);
  }

  accessTokenInstance = loginRes.body.accessToken;
  return appInstance;
}

/**
 * Finds a top-level category of the seed user by name and type (default categories have random ids).
 * Returns it with its subcategories.
 */
export async function findCategory(name: string, type: 'EXPENSE' | 'INCOME'): Promise<any> {
  const res = await request(appInstance.getHttpServer())
    .get('/api/v1/categories')
    .set('Authorization', `Bearer ${getAccessToken()}`);
  const category = res.body.find((c: any) => c.name === name && c.type === type);
  if (!category) {
    throw new Error(`Category ${type}/${name} not found for the seed user: run npm run prisma:seed`);
  }
  return category;
}

/**
 * Creates an invitation with the seed user (ADMIN since the seed) and returns its code:
 * registration is invitation-only.
 */
export async function createInvitation(body: { email?: string; expiresInDays?: number } = {}): Promise<{ id: string; code: string }> {
  const res = await request(appInstance.getHttpServer())
    .post('/api/v1/invitations')
    .set('Authorization', `Bearer ${getAccessToken()}`)
    .send(body);
  if (res.status !== 201) {
    throw new Error(`Failed to create invitation (is the seed user ADMIN? run npm run prisma:seed): ${JSON.stringify(res.body)}`);
  }
  return { id: res.body.id, code: res.body.code };
}

/**
 * Creates an account of the seed user only for one suite, so suites running in parallel never change
 * each other's balances (they used to share the seed Revolut account). Returns its id.
 */
export async function createTestAccount(label: string, balance = 1000): Promise<string> {
  const res = await request(appInstance.getHttpServer())
    .post('/api/v1/accounts')
    .set('Authorization', `Bearer ${getAccessToken()}`)
    .send({ name: `E2E ${label} ${Date.now()}`, type: 'BANK', currency: 'EUR', balance });
  if (res.status !== 201) {
    throw new Error(`Failed to create test account: ${JSON.stringify(res.body)}`);
  }
  return res.body.id;
}

/**
 * Removes the accounts a suite created (call it in afterAll). Accounts with transactions or movements
 * other than OPENING can only be deactivated, so they stay inactive in the dev DB.
 */
export async function deactivateAccounts(ids: (string | undefined)[]): Promise<void> {
  for (const id of ids.filter(Boolean)) {
    await request(appInstance.getHttpServer())
      .delete(`/api/v1/accounts/${id}`)
      .set('Authorization', `Bearer ${getAccessToken()}`);
  }
}

/**
 * Deletes the integrations a suite created (call it in afterAll, before closeSharedTestApp),
 * so test runs do not pile up integrations in the dev DB. Their import events stay (integrationId → null).
 */
export async function deleteIntegrations(ids: (string | undefined)[]): Promise<void> {
  for (const id of ids.filter(Boolean)) {
    const res = await request(appInstance.getHttpServer())
      .delete(`/api/v1/integrations/${id}`)
      .set('Authorization', `Bearer ${getAccessToken()}`);
    if (res.status >= 300 && res.status !== 404) {
      throw new Error(`Failed to delete integration ${id}: HTTP ${res.status} ${JSON.stringify(res.body)}`);
    }
  }
}

export function getAccessToken(): string {
  if (!accessTokenInstance) {
    throw new Error('Access token not initialized. Call getSharedTestApp() first.');
  }
  return accessTokenInstance;
}

export async function closeSharedTestApp(): Promise<void> {
  if (appInstance) {
    await appInstance.close();
    appInstance = undefined as any;
    accessTokenInstance = undefined as any;
  }
  if (moduleInstance) {
    await moduleInstance.close();
    moduleInstance = undefined as any;
  }
}