import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

/**
 * Shared app configuration for local server (main.ts) and Vercel (serverless.ts).
 */
export function configureApp(app: INestApplication): { apiPrefix: string; swaggerEnabled: boolean } {
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('API_PREFIX') ?? 'api/v1';
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.setGlobalPrefix(apiPrefix);

  // CORS_ORIGINS: comma-separated list. Unset → any origin (local development only)
  const corsOrigins = configService
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors(corsOrigins?.length ? { origin: corsOrigins } : undefined);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const swaggerEnabled = !isProduction;
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('Cushqui API')
      .setDescription('Personal Finance Management API')
      .setVersion('1.0')
      .addBearerAuth()
      .addTag('auth', 'Authentication')
      .addTag('accounts', 'Financial Accounts')
      .addTag('categories', 'Categories')
      .addTag('transactions', 'Transactions')
      .addTag('imports', 'Data Imports')
      .addTag('dashboard', 'Dashboard')
      .addTag('statistics', 'Statistics')
      .addTag('transfers', 'Transfers')
      .addTag('movements', 'Account Movements')
      .addTag('health', 'Health Check')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  return { apiPrefix, swaggerEnabled };
}
