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