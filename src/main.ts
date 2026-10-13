import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const port = app.get(ConfigService).get<number>('PORT') ?? 3000;
  const { apiPrefix, swaggerEnabled } = configureApp(app);

  await app.listen(port);
  console.log(`🚀 Cushqui API running on http://localhost:${port}/${apiPrefix}`);
  if (swaggerEnabled) {
    console.log(`📚 Swagger docs available at http://localhost:${port}/docs`);
  }
}

bootstrap();
