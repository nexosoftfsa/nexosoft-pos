/**
 * Verificación end-to-end de COMBOS (Fase 8.1) y LOTES/VENCIMIENTOS (Fase 8.2)
 * contra PostgreSQL real (embebido, sin Docker). Materializa el schema con
 * `prisma db push` (valida las tablas nuevas), levanta la app NestJS real y
 * ejerce el flujo completo:
 *   - Combo: venta por /sync descuenta el stock de los COMPONENTES; la anulación
 *     lo restaura.
 *   - Lotes: ENTRADA abre lotes con vencimiento; la venta consume por FEFO; el
 *     endpoint de vencimientos alerta lo que está por vencer.
 *
 * Uso:  pnpm --filter @nexosoft/cloud-api verify:e2e:features
 * (compila antes con `nest build`).
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

const work = join(tmpdir(), 'nexosoft-e2e-features');
const dataDir = join(work, 'pgdata');
const respaldoDir = join(work, 'respaldos');
const PORT = 5437;
const DB_URL = `postgresql://postgres:postgres@localhost:${PORT}/nexosoft`;
const BASE = 'http://localhost:3102/api/v1';

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

const diasDesdeHoy = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

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

  paso(2, 'Schema real con Prisma (db push) — incluye Producto.tipo/requiereLote, ComboComponente, Lote');
  execSync('corepack pnpm exec prisma db push --skip-generate --accept-data-loss', {
    cwd: CLOUD_API, env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'pipe',
  });
  ok('tablas creadas (incluye combo_componente y lotes)');

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
  await app.listen(3102);
  ok('escuchando en :3102');

  paso(5, 'register (ADMIN) + login');
  await api('POST', '/auth/register', null, {
    email: 'duenio@nexo.com', nombreDisplay: 'Dueño', password: 'secreto123', sucursalId: sucursal.id, rol: 'ADMIN',
  });
  const token = (await api('POST', '/auth/login', null, { email: 'duenio@nexo.com', password: 'secreto123' })).accessToken;
  ok('token JWT obtenido');

  // ─── COMBOS ────────────────────────────────────────────────────────────────
  paso(6, 'COMBO: café + alfajor simples con stock, y un combo que los agrupa');
  const cafe = await api('POST', '/productos', token, {
    codigo: 'CAFE', nombre: 'Café molido', precioVenta: '4300', precioCosto: '2800',
  });
  const alfajor = await api('POST', '/productos', token, {
    codigo: 'ALF', nombre: 'Alfajor triple', precioVenta: '1200', precioCosto: '700',
  });
  await api('POST', '/stock/movimientos', token, { productoId: cafe.id, tipo: 'ENTRADA', cantidad: '50' });
  await api('POST', '/stock/movimientos', token, { productoId: alfajor.id, tipo: 'ENTRADA', cantidad: '50' });
  const combo = await api('POST', '/productos', token, {
    codigo: 'COMBO1', nombre: 'Combo Merienda', precioVenta: '3000', precioCosto: '2000',
    tipo: 'COMBO', componentes: [
      { componenteId: cafe.id, cantidad: '1' },
      { componenteId: alfajor.id, cantidad: '2' },
    ],
  });
  assert(combo.tipo === 'COMBO' && combo.componentes.length === 2, 'el combo debía crearse con 2 componentes');
  ok(`combo creado (café×1 + alfajor×2)`);

  paso(7, 'COMBO: vender 3 combos por /sync → descuenta stock de los componentes');
  const ventaCombo = await api('POST', '/sync/operaciones', token, {
    operaciones: [{
      operacionId: 'op-combo', tipo: 'venta', terminalId: terminal.id,
      payload: { medioPago: 'EFECTIVO', items: [{ productoId: combo.id, cantidad: '3', precioUnitario: '3000' }] },
    }],
  });
  assert(ventaCombo['op-combo']?.ok === true, 'la venta del combo debía aplicarse');
  const saldoCafe = (await api('GET', '/stock/' + cafe.id, token)).saldo;
  const saldoAlf = (await api('GET', '/stock/' + alfajor.id, token)).saldo;
  assert(saldoCafe === '47', `café esperado 47 (50-3×1), obtenido ${saldoCafe}`);
  assert(saldoAlf === '44', `alfajor esperado 44 (50-3×2), obtenido ${saldoAlf}`);
  const saldoComboMismo = (await api('GET', '/stock/' + combo.id, token)).saldo;
  assert(saldoComboMismo === '0', `el combo no tiene stock propio, obtenido ${saldoComboMismo}`);
  ok(`café=47, alfajor=44, combo=0 (el stock salió de los componentes)`);

  paso(8, 'COMBO: anular la venta → restaura el stock de los componentes');
  const idVentaCombo = ventaCombo['op-combo'].idRemoto;
  await api('POST', `/ventas/${idVentaCombo}/anular`, token);
  const cafeTrasAnular = (await api('GET', '/stock/' + cafe.id, token)).saldo;
  const alfTrasAnular = (await api('GET', '/stock/' + alfajor.id, token)).saldo;
  assert(cafeTrasAnular === '50', `café debía volver a 50, obtenido ${cafeTrasAnular}`);
  assert(alfTrasAnular === '50', `alfajor debía volver a 50, obtenido ${alfTrasAnular}`);
  ok('café=50, alfajor=50 (la NC restauró los componentes)');

  // ─── LOTES ───────────────────────────────────────────────────────────────
  paso(9, 'LOTE: yogur perecedero con dos lotes (uno próximo a vencer, otro lejano)');
  const yogur = await api('POST', '/productos', token, {
    codigo: 'YOG', nombre: 'Yogur bebible', precioVenta: '900', precioCosto: '500', requiereLote: true,
  });
  assert(yogur.requiereLote === true, 'el yogur debía quedar como perecedero');
  await api('POST', '/stock/movimientos', token, {
    productoId: yogur.id, tipo: 'ENTRADA', cantidad: '10', numeroLote: 'L-PROX', fechaVencimiento: diasDesdeHoy(5),
  });
  await api('POST', '/stock/movimientos', token, {
    productoId: yogur.id, tipo: 'ENTRADA', cantidad: '20', numeroLote: 'L-LEJOS', fechaVencimiento: diasDesdeHoy(60),
  });
  const saldoYogur = (await api('GET', '/stock/' + yogur.id, token)).saldo;
  assert(saldoYogur === '30', `yogur esperado 30, obtenido ${saldoYogur}`);
  ok('yogur=30 en 2 lotes (L-PROX vence en 5 días, L-LEJOS en 60)');

  paso(10, 'LOTE: alerta de vencimiento (dentro de 30 días) incluye solo el lote próximo');
  const alertas1 = await api('GET', '/stock/vencimientos?dias=30', token);
  assert(alertas1.length === 1, `esperaba 1 alerta, hay ${alertas1.length}`);
  assert(alertas1[0].numero === 'L-PROX', `la alerta debía ser L-PROX, es ${alertas1[0].numero}`);
  assert(alertas1[0].vencido === false && alertas1[0].saldo === '10', 'L-PROX: no vencido, saldo 10');
  ok(`1 alerta: ${alertas1[0].numero} (vence en ${alertas1[0].diasParaVencer} días, saldo ${alertas1[0].saldo})`);

  paso(11, 'LOTE: vender 12 yogures por /sync → FEFO consume primero el lote que vence antes');
  const ventaYogur = await api('POST', '/sync/operaciones', token, {
    operaciones: [{
      operacionId: 'op-yogur', tipo: 'venta', terminalId: terminal.id,
      payload: { medioPago: 'EFECTIVO', items: [{ productoId: yogur.id, cantidad: '12', precioUnitario: '900' }] },
    }],
  });
  assert(ventaYogur['op-yogur']?.ok === true, 'la venta del yogur debía aplicarse');
  const lotes = await api('GET', `/stock/${yogur.id}/lotes`, token);
  const prox = lotes.find((l) => l.numero === 'L-PROX');
  const lejos = lotes.find((l) => l.numero === 'L-LEJOS');
  assert(prox.saldo === '0', `L-PROX debía quedar en 0 (FEFO), obtenido ${prox.saldo}`);
  assert(lejos.saldo === '18', `L-LEJOS debía quedar en 18 (20-2), obtenido ${lejos.saldo}`);
  ok('FEFO OK: L-PROX=0 (consumido primero), L-LEJOS=18');

  paso(12, 'LOTE: tras vender el lote próximo, ya no aparece en las alertas');
  const alertas2 = await api('GET', '/stock/vencimientos?dias=30', token);
  assert(alertas2.length === 0, `no debía quedar ninguna alerta, hay ${alertas2.length}`);
  ok('sin alertas (el lote próximo se agotó)');

  console.log('\n\x1b[32m=== E2E COMBOS + LOTES EXITOSO ===\x1b[0m');
} finally {
  if (app) await app.close();
  await pg.stop().catch(() => {});
}
