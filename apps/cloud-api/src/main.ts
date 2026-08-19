import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Fase 14: el body-parser de Express (que usa Nest por debajo) limita el
  // JSON a 100kb por defecto -- un catalogo real de varios cientos de
  // articulos enviado de una por el importador de Excel lo supera facil
  // ("request entity too large" / 413). 20mb cubre catalogos grandes con
  // margen de sobra.
  app.useBodyParser('json', { limit: '20mb' });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();
  app.setGlobalPrefix('api/v1');

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`NexoSoft cloud-api corriendo en http://localhost:${port}/api/v1`);
}

bootstrap();
