import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

type ExpressHandler = (req: Request, res: Response) => void;

/**
 * Vercel entry point (loaded by api/index.js). The Nest app is created once per
 * warm instance and reused across invocations; concurrent cold requests share
 * the same initialization promise.
 */
let handlerPromise: Promise<ExpressHandler> | undefined;

async function createHandler(): Promise<ExpressHandler> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function handler(req: Request, res: Response) {
  handlerPromise ??= createHandler().catch((error) => {
    // Allow the next request to retry instead of caching the failure
    handlerPromise = undefined;
    throw error;
  });

  const appHandler = await handlerPromise;
  return appHandler(req, res);
}
