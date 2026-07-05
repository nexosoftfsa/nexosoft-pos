/**
 * Seed de DEMO realista para mostrar el sistema a un cliente. Levanta la app
 * NestJS real sobre PostgreSQL embebido y la puebla con un almacén verosímil:
 * categorías, productos variados (con combos y perecederos por lote), stock,
 * clientes con cuenta corriente, una caja abierta y ventas de varios días.
 *
 * Uso rápido (verifica el seed y muestra un resumen, luego apaga todo):
 *   pnpm --filter @nexosoft/cloud-api seed:demo
 *
 * Demo EN VIVO (deja el backend corriendo en :3000 para apuntar el POS/panel):
 *   DEMO_KEEPALIVE=1 pnpm --filter @nexosoft/cloud-api seed:demo
 *   (login: duenio@nexo.com / demo1234 — ADMIN)
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

const KEEPALIVE = process.env.DEMO_KEEPALIVE === '1';
const PG_PORT = Number(process.env.DEMO_PG_PORT ?? 5438);
const API_PORT = Number(process.env.DEMO_API_PORT ?? 3000);
const work = join(tmpdir(), 'nexosoft-demo');
const dataDir = join(work, 'pgdata');
const respaldoDir = join(work, 'respaldos');
const DB_URL = `postgresql://postgres:postgres@localhost:${PG_PORT}/nexosoft`;
const BASE = `http://localhost:${API_PORT}/api/v1`;

if (existsSync(work)) rmSync(work, { recursive: true, force: true });

const log = (m) => console.log(m);
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m ' + m);

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

const hoyMenos = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

const pg = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres', port: PG_PORT, persistent: false,
});

let app;
let prisma;
try {
  log('\n\x1b[1mSeed de demo NexoSoft\x1b[0m');
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('nexosoft');
  ok('PostgreSQL en :' + PG_PORT);

  execSync('corepack pnpm exec prisma db push --skip-generate --accept-data-loss', {
    cwd: CLOUD_API, env: { ...process.env, DATABASE_URL: DB_URL }, stdio: 'pipe',
  });
  ok('schema aplicado');

  const { PrismaClient } = require('@prisma/client');
  prisma = new PrismaClient({ datasourceUrl: DB_URL });
  const sucursal = await prisma.sucursal.create({ data: { nombre: 'Almacén Don José' } });
  const caja1 = await prisma.terminal.create({ data: { nombre: 'Caja 1', sucursalId: sucursal.id } });
  await prisma.terminal.create({ data: { nombre: 'Caja 2', sucursalId: sucursal.id } });
  ok('sucursal "Almacén Don José" + Caja 1 / Caja 2');

  process.env.DATABASE_URL = DB_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'demo-secret';
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'demo-refresh';
  process.env.RESPALDO_RUTA = respaldoDir;
  process.env.RESPALDO_CRON = '';
  const { NestFactory } = require('@nestjs/core');
  const { ValidationPipe } = require('@nestjs/common');
  const { AppModule } = await import(pathToFileURL(join(CLOUD_API, 'dist/app.module.js')).href);
  app = await NestFactory.create(AppModule, { logger: false });
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.setGlobalPrefix('api/v1');
  await app.listen(API_PORT);
  ok('cloud-api en :' + API_PORT);

  await api('POST', '/auth/register', null, {
    email: 'duenio@nexo.com', nombreDisplay: 'José (dueño)', password: 'demo1234', sucursalId: sucursal.id, rol: 'ADMIN',
  });
  await api('POST', '/auth/register', null, {
    email: 'cajera@nexo.com', nombreDisplay: 'Marta (cajera)', password: 'demo1234', sucursalId: sucursal.id, rol: 'CAJERO',
  });
  const token = (await api('POST', '/auth/login', null, { email: 'duenio@nexo.com', password: 'demo1234' })).accessToken;
  ok('usuarios: duenio@nexo.com (ADMIN) + cajera@nexo.com (CAJERO) — clave demo1234');

  // ─── Categorías ───────────────────────────────────────────────────────────
  const cats = {};
  for (const nombre of ['Bebidas', 'Almacén', 'Panadería', 'Fiambrería', 'Limpieza']) {
    cats[nombre] = (await api('POST', '/categorias', token, { nombre })).id;
  }

  // ─── Productos ─────────────────────────────────────────────────────────────
  const P = {}; // codigo → producto
  async function producto(codigo, nombre, precioVenta, precioCosto, categoria, extra = {}) {
    const p = await api('POST', '/productos', token, {
      codigo, nombre, precioVenta, precioCosto, categoriaId: cats[categoria], ...extra,
    });
    P[codigo] = p;
    return p;
  }
  async function stock(codigo, cantidad) {
    await api('POST', '/stock/movimientos', token, { productoId: P[codigo].id, tipo: 'ENTRADA', cantidad });
  }
  async function lote(codigo, cantidad, numeroLote, dias) {
    await api('POST', '/stock/movimientos', token, {
      productoId: P[codigo].id, tipo: 'ENTRADA', cantidad, numeroLote, fechaVencimiento: hoyMenos(dias),
    });
  }

  await producto('GAS15', 'Gaseosa cola 1,5 L', '1850', '1100', 'Bebidas');
  await producto('AGUA', 'Agua mineral 500 ml', '900', '520', 'Bebidas');
  await producto('CERV', 'Cerveza rubia 1 L', '2200', '1400', 'Bebidas');
  await producto('YERBA', 'Yerba mate 1 kg', '3800', '2500', 'Almacén');
  await producto('CAFE', 'Café molido 250 g', '4300', '2800', 'Almacén');
  await producto('ACEITE', 'Aceite girasol 900 ml', '2600', '1750', 'Almacén');
  await producto('FIDEOS', 'Fideos tirabuzón 500 g', '1200', '780', 'Almacén');
  await producto('ARROZ', 'Arroz largo fino 1 kg', '1600', '1050', 'Almacén');
  await producto('PAN', 'Pan lactal', '2100', '1300', 'Panadería');
  await producto('ALF', 'Alfajor triple', '1200', '700', 'Panadería');
  await producto('JAMON', 'Jamón cocido (100 g)', '2900', '1900', 'Fiambrería', { requiereLote: true });
  await producto('QUESO', 'Queso cremoso (100 g)', '2400', '1600', 'Fiambrería', { requiereLote: true });
  await producto('LAVA', 'Lavandina 1 L', '950', '600', 'Limpieza');
  await producto('DETE', 'Detergente 750 ml', '1700', '1100', 'Limpieza');

  // Stock simple.
  for (const [c, q] of [
    ['GAS15', '48'], ['AGUA', '60'], ['CERV', '36'], ['YERBA', '30'], ['CAFE', '22'],
    ['ACEITE', '18'], ['FIDEOS', '40'], ['ARROZ', '35'], ['PAN', '4'], ['ALF', '80'],
    ['LAVA', '25'], ['DETE', '3'],
  ]) await stock(c, q);
  // Perecederos por lote (algunos por vencer, otro ya vencido para la alerta).
  await lote('JAMON', '15', 'J-2406', 4);
  await lote('JAMON', '20', 'J-2408', 25);
  await lote('QUESO', '8', 'Q-2405', -2);
  await lote('QUESO', '18', 'Q-2409', 45);
  ok(`${Object.keys(P).length} productos (2 perecederos con lotes; Pan y Detergente en stock bajo)`);

  // ─── Combos ────────────────────────────────────────────────────────────────
  await api('POST', '/productos', token, {
    codigo: 'COMBO-DESAYUNO', nombre: 'Combo Desayuno', precioVenta: '5500', precioCosto: '3500', tipo: 'COMBO',
    componentes: [{ componenteId: P['CAFE'].id, cantidad: '1' }, { componenteId: P['ALF'].id, cantidad: '2' }],
  }).then((c) => (P['COMBO-DESAYUNO'] = c));
  await api('POST', '/productos', token, {
    codigo: 'COMBO-ASADO', nombre: 'Combo Asado', precioVenta: '9900', precioCosto: '6800', tipo: 'COMBO',
    componentes: [{ componenteId: P['CERV'].id, cantidad: '6' }, { componenteId: P['PAN'].id, cantidad: '1' }],
  }).then((c) => (P['COMBO-ASADO'] = c));
  ok('2 combos: Combo Desayuno (café+2 alfajores), Combo Asado (6 cervezas+pan)');

  // ─── Clientes + cuenta corriente ────────────────────────────────────────────
  const clientes = {};
  for (const [nombre, doc, iva] of [
    ['Kiosco La Esquina', '20304050607', 'RESPONSABLE_INSCRIPTO'],
    ['Ana Gómez', '27334455668', 'CONSUMIDOR_FINAL'],
    ['Bar El Tano', '30712345678', 'MONOTRIBUTO'],
  ]) {
    clientes[nombre] = await api('POST', '/clientes', token, {
      nombre, documento: doc, condicionIva: iva, limiteCredito: '100000',
    });
  }
  // Movimientos de cuenta corriente (una deuda parcialmente pagada).
  await api('POST', `/clientes/${clientes['Kiosco La Esquina'].id}/cargos`, token, { monto: '45000', concepto: 'Fiado semana' });
  await api('POST', `/clientes/${clientes['Kiosco La Esquina'].id}/pagos`, token, { monto: '20000', concepto: 'A cuenta' });
  await api('POST', `/clientes/${clientes['Bar El Tano'].id}/cargos`, token, { monto: '18000', concepto: 'Pedido' });
  ok('3 clientes; Kiosco La Esquina debe $25.000, Bar El Tano $18.000');

  // ─── Caja abierta ───────────────────────────────────────────────────────────
  const turno = await api('POST', '/caja/turnos', token, { terminalId: caja1.id, fondoApertura: '15000' });
  await api('POST', `/caja/turnos/${turno.id}/movimientos`, token, { tipo: 'INGRESO', monto: '5000', concepto: 'Aporte' });
  await api('POST', `/caja/turnos/${turno.id}/movimientos`, token, { tipo: 'EGRESO', monto: '3000', concepto: 'Pago flete' });
  ok('Caja 1 abierta (fondo $15.000, +$5.000 ingreso, -$3.000 egreso)');

  // ─── Ventas de varios días ──────────────────────────────────────────────────
  const medios = ['EFECTIVO', 'TARJETA_DEBITO', 'EFECTIVO', 'MERCADOPAGO_QR', 'TARJETA_CREDITO'];
  const item = (codigo, cantidad) => ({
    productoId: P[codigo].id, cantidad: String(cantidad), precioUnitario: P[codigo].precioVenta,
  });
  const canastas = [
    [item('GAS15', 2), item('PAN', 1)],
    [item('YERBA', 1), item('ARROZ', 1)],
    [item('COMBO-DESAYUNO', 1)],
    [item('JAMON', 3), item('QUESO', 2)],
    [item('CERV', 6), item('ALF', 4)],
    [item('COMBO-ASADO', 1)],
    [item('ACEITE', 1), item('FIDEOS', 2), item('ARROZ', 1)],
    [item('AGUA', 4)],
    [item('CAFE', 1), item('ALF', 3)],
    [item('DETE', 1), item('LAVA', 2)],
    [item('JAMON', 4)],
    [item('GAS15', 1), item('CERV', 3), item('PAN', 1)],
  ];
  const ventaIds = [];
  for (let i = 0; i < canastas.length; i++) {
    const r = await api('POST', '/sync/operaciones', token, {
      operaciones: [{
        operacionId: `demo-venta-${i}`, tipo: 'venta', terminalId: caja1.id,
        payload: { medioPago: medios[i % medios.length], items: canastas[i] },
      }],
    });
    const rr = r[`demo-venta-${i}`];
    if (rr?.ok) ventaIds.push(rr.idRemoto);
    else console.warn(`  \x1b[33m!\x1b[0m venta ${i} no aplicada: ${rr?.error ?? 'desconocido'}`);
  }
  // Repartir las ventas en los últimos 6 días para que los reportes se vean vivos.
  for (let i = 0; i < ventaIds.length; i++) {
    const atras = i % 6;
    if (atras > 0) {
      await prisma.venta.update({
        where: { id: ventaIds[i] },
        data: { creadaEn: new Date(hoyMenos(-atras)) },
      });
    }
  }
  ok(`${ventaIds.length} ventas (varios medios de pago), repartidas en los últimos 6 días`);

  // ─── Features de Fase 9: presupuesto, remito, venta fiada ───────────────────
  await api('POST', '/presupuestos', token, {
    clienteNombre: 'Ana Gómez', validezDias: 15,
    items: [
      { descripcion: P['YERBA'].nombre, cantidad: '2', precioUnitario: P['YERBA'].precioVenta, productoId: P['YERBA'].id },
      { descripcion: P['CAFE'].nombre, cantidad: '1', precioUnitario: P['CAFE'].precioVenta, productoId: P['CAFE'].id },
    ],
  });
  await api('POST', '/remitos', token, {
    clienteNombre: 'Bar El Tano',
    items: [{ descripcion: P['CERV'].nombre, cantidad: '12', productoId: P['CERV'].id }],
  });
  const fiado = await api('POST', '/sync/operaciones', token, {
    operaciones: [{
      operacionId: 'demo-fiado', tipo: 'venta', terminalId: caja1.id,
      payload: {
        medioPago: 'CUENTA_CORRIENTE', clienteId: clientes['Ana Gómez'].id,
        items: [item('ACEITE', 1), item('FIDEOS', 2)],
      },
    }],
  });
  if (fiado['demo-fiado']?.ok) {
    const saldoAna = (await api('GET', `/clientes/${clientes['Ana Gómez'].id}`, token)).saldo;
    ok(`1 presupuesto vigente, 1 remito (descontó stock), 1 venta fiada → Ana debe $${saldoAna}`);
  }

  // ─── Resumen ────────────────────────────────────────────────────────────────
  const resumen = await api('GET', `/reportes/ventas/resumen?desde=${hoyMenos(-30).slice(0, 10)}&hasta=${hoyMenos(1).slice(0, 10)}`, token);
  const vencs = await api('GET', '/stock/vencimientos?dias=30', token);
  log('\n\x1b[1mResumen de la demo\x1b[0m');
  log(`  Ventas (30 días):   ${resumen.cantidadVentas}  ·  Total $${resumen.totalVendido}  ·  Ticket $${resumen.ticketPromedio}`);
  log(`  Lotes por vencer:   ${vencs.length} (${vencs.map((v) => `${v.producto.codigo}/${v.numero}`).join(', ')})`);
  log(`  Login demo:         duenio@nexo.com / demo1234  (o cajera@nexo.com)`);

  if (KEEPALIVE) {
    log(`\n\x1b[32mBackend de demo en ${BASE.replace('/api/v1', '')}\x1b[0m — dejalo corriendo y apuntá el POS/panel acá.`);
    log('  (Ctrl+C para terminar)\n');
    await new Promise(() => {}); // no resolver: mantener vivo
  } else {
    log('\n\x1b[32m=== SEED DE DEMO OK ===\x1b[0m  (usá DEMO_KEEPALIVE=1 para dejarlo corriendo)');
  }
} finally {
  if (!KEEPALIVE) {
    if (prisma) await prisma.$disconnect().catch(() => {});
    if (app) await app.close();
    await pg.stop().catch(() => {});
  }
}
