/**
 * Verificación end-to-end del flujo de sincronización, sin Docker.
 *
 * Levanta PostgreSQL embebido (binario portable), crea el schema real con
 * Prisma, arranca la app NestJS de verdad y ejerce el endpoint POST
 * /sync/operaciones: ingesta de un lote de ventas desde una "terminal",
 * verificando descuento de stock, idempotencia y libro de ventas Excel.
 *
 * Uso:  pnpm --filter @nexosoft/cloud-api verify:e2e
 * (el script `verify:e2e` compila antes con `nest build`).
 */
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const CLOUD_API = join(__dirname, '..');

const _emb = require('embedded-postgres');
const EmbeddedPostgres = _emb.default ?? _emb;
const ExcelJS = require('exceljs');

const work = join(tmpdir(), 'nexosoft-e2e-sync');
const dataDir = join(work, 'pgdata');
const respaldoDir = join(work, 'respaldos');
const PORT = 5435;
const DB_URL = `postgresql://postgres:postgres@localhost:${PORT}/nexosoft`;
const BASE = 'http://localhost:3101/api/v1';

if (existsSync(work)) rmSync(work, { recursive: true, force: true });

const ok = (m) => console.log('  \x1b[32mOK\x1b[0m ' + m);
const paso = (n, m) => console.log(`\n[PASO ${n}] ${m}`);
function assert(cond, msg) {
  if (!cond) throw new Error('ASSERT FALLÓ: ' + msg);
}

async function api(metodo, ruta, token, body) {
  const res = await fetch(BASE + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${metodo} ${ruta} -> ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PORT, persistent: false,
});

let app;
try {
  paso(1, 'PostgreSQL embebido');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('nexosoft');
  ok('corriendo en :' + PORT);

  paso(2, 'Schema real con Prisma (db push)');
  execSync('corepack pnpm exec prisma db push --skip-generate --accept-data-loss', {
    cwd: CLOUD_API, env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'pipe',
  });
  ok('tablas creadas');

  paso(3, 'Sembrar sucursal + terminal');
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient({ datasourceUrl: DB_URL });
  const sucursal = await prisma.sucursal.create({ data: { nombre: 'Sucursal Centro' } });
  const terminal = await prisma.terminal.create({ data: { nombre: 'Caja 1', sucursalId: sucursal.id } });
  await prisma.$disconnect();
  ok(`sucursal=${sucursal.id} terminal=${terminal.id}`);

  paso(4, 'Levantar app NestJS real');
  process.env.DATABASE_URL = DB_URL;
  process.env.JWT_SECRET = 'e2e';
  process.env.JWT_REFRESH_SECRET = 'e2e-r';
  process.env.RESPALDO_RUTA = respaldoDir;
  process.env.RESPALDO_CRON = '';
  const { NestFactory } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = await import(pathToFileURL(join(CLOUD_API, 'dist/app.module.js')).href);
  app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(3101);
  ok('escuchando en :3101');

  paso(5, 'register + login');
  await api('POST', '/auth/register', null, {
    email: 'cajero@nexo.com', nombreDisplay: 'Cajero', password: 'secreto123', sucursalId: sucursal.id, rol: 'CAJERO',
  });
  const token = (await api('POST', '/auth/login', null, { email: 'cajero@nexo.com', password: 'secreto123' })).accessToken;
  ok('token JWT obtenido');

  paso(6, 'producto + stock inicial (ENTRADA 100)');
  const prod = await api('POST', '/productos', token, {
    codigo: '7790001', nombre: 'Yerba 1kg', precioVenta: '2500.00', precioCosto: '1800.00',
  });
  await api('POST', '/stock/movimientos', token, { productoId: prod.id, tipo: 'ENTRADA', cantidad: '100' });
  ok('stock inicial = ' + (await api('GET', '/stock/' + prod.id, token)).saldo);

  paso(7, 'POST /sync/operaciones — lote de 2 ventas desde la terminal');
  const lote = {
    operaciones: [
      { operacionId: 'op-a', tipo: 'venta', terminalId: terminal.id,
        payload: { medioPago: 'EFECTIVO', items: [{ productoId: prod.id, cantidad: '2', precioUnitario: '2500' }] } },
      { operacionId: 'op-b', tipo: 'venta', terminalId: terminal.id,
        payload: { medioPago: 'TARJETA_DEBITO', items: [{ productoId: prod.id, cantidad: '5', precioUnitario: '2500' }] } },
    ],
  };
  const res1 = await api('POST', '/sync/operaciones', token, lote);
  assert(res1['op-a']?.ok === true, 'op-a debía aplicarse');
  assert(res1['op-b']?.ok === true, 'op-b debía aplicarse');
  ok(`ambas operaciones aplicadas (idRemoto a=${res1['op-a'].idRemoto}, b=${res1['op-b'].idRemoto})`);

  paso(8, 'verificar stock descontado (100 - 2 - 5 = 93)');
  const saldo = (await api('GET', '/stock/' + prod.id, token)).saldo;
  assert(saldo === '93', 'stock esperado 93, obtenido ' + saldo);
  ok('stock = ' + saldo);

  paso(9, 'reenviar EL MISMO lote (idempotencia)');
  const res2 = await api('POST', '/sync/operaciones', token, lote);
  assert(res2['op-a']?.idRemoto === res1['op-a'].idRemoto, 'op-a debía devolver la misma venta');
  const saldoDup = (await api('GET', '/stock/' + prod.id, token)).saldo;
  assert(saldoDup === '93', 'idempotencia rota: stock cambió a ' + saldoDup);
  ok('sin duplicar: stock sigue en ' + saldoDup);

  paso(10, 'historial + verificación de terminalId');
  const historial = await api('GET', '/ventas', token);
  assert(historial.length === 2, 'esperaba 2 ventas, hay ' + historial.length);
  assert(historial.every((v) => v.terminalId === terminal.id), 'todas deben tener el terminalId');
  ok(`${historial.length} ventas, todas con terminalId correcto`);

  paso(11, 'libro de ventas Excel');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(respaldoDir, 'ventas.xlsx'));
  const filas = wb.getWorksheet('Ventas').rowCount - 1;
  assert(filas === 2, 'esperaba 2 filas en el Excel, hay ' + filas);
  ok(filas + ' filas en el Excel');

  console.log('\n\x1b[32m=== E2E SYNC EXITOSO ===\x1b[0m');
} finally {
  if (app) await app.close();
  await pg.stop().catch(() => {});
}
