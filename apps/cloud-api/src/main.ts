import 'reflect-metadata';
import { createServer } from 'node:http';
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

  // Fase 15.B: admin-web puede quedar expuesto a internet detrás de un
  // reverse proxy (Cloudflare Tunnel). `trust proxy` hace que Express lea la
  // IP real del cliente desde X-Forwarded-For en vez de la IP del túnel/proxy
  // -- sin esto, el rate-limiting por IP (ver ThrottlerModule en app.module.ts)
  // no sirve de nada, porque todos los pedidos parecerían venir del mismo lado.
  app.set('trust proxy', 1);

  // CORS_ORIGINS: lista separada por comas de orígenes permitidos (ej. el
  // dominio del túnel). Sin la variable, sigue abierto a cualquier origen --
  // el default de antes de esta fase, correcto mientras todo corre en la LAN
  // (ADR-0019). Definila en producción antes de exponer el servidor afuera.
  const origenes = process.env['CORS_ORIGINS'];
  app.enableCors(origenes ? { origin: origenes.split(',').map((o) => o.trim()) } : undefined);
  app.setGlobalPrefix('api/v1');

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  console.log(`NexoSoft cloud-api corriendo en http://localhost:${port}/api/v1`);

  // Fase 17.C (ADR-0057): un segundo listener SÓLO para el túnel de acceso
  // remoto, atado a loopback (nunca se abre en el firewall, así que desde la
  // LAN no se llega). Que una petición entre por este puerto es la señal
  // imposible de falsificar de que viene de internet, y es lo que usa
  // RestriccionRemotaGuard para dejar el acceso remoto en solo lectura.
  //
  // Es la MISMA app de Nest: no se duplica nada, sólo se la escucha en dos
  // sockets distintos.
  const portRemoto = Number(process.env['PORT_REMOTO'] ?? 3001);
  const servidorRemoto = createServer(app.getHttpAdapter().getInstance());
  // El acceso remoto es OPCIONAL: si este puerto no se puede abrir (otra app
  // ya lo tiene), el comercio tiene que poder seguir vendiendo igual. Sin
  // este manejador, Node emite un 'error' no capturado y se lleva puesto todo
  // el servidor -- verificado: la parte de la LAN ya había arrancado bien y
  // el proceso moría igual.
  servidorRemoto.on('error', (e: NodeJS.ErrnoException) => {
    console.error(
      `No se pudo abrir el puerto del acceso remoto (${portRemoto}): ${e.code ?? e.message}. ` +
        'El servidor sigue funcionando en la red del local; el panel no se va a ver desde afuera ' +
        'hasta que se libere ese puerto o se cambie PORT_REMOTO.',
    );
  });
  servidorRemoto.listen(portRemoto, '127.0.0.1', () => {
    console.log(`Acceso remoto (solo lectura) escuchando en 127.0.0.1:${portRemoto}`);
  });
}

bootstrap();
