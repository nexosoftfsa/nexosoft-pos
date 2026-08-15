/**
 * Provisiona la primera Sucursal de un comercio nuevo contra un cloud-api ya
 * corriendo, con su base recién migrada. Necesario antes de dar de alta el
 * primer usuario (ADMIN): `Usuario.sucursalId` es FK obligatoria y hoy no
 * existe ningún endpoint HTTP para crear sucursales (solo se usan en seeds de
 * demo). Uso directo de Prisma, no HTTP — no hay sesión previa posible.
 *
 * Uso:
 *   corepack pnpm --filter @nexosoft/cloud-api crear:sucursal -- --nombre "Minimarket Piloto"
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');

function leerArgs() {
  const args = process.argv.slice(2);
  const i = args.indexOf('--nombre');
  const nombre = i >= 0 ? args[i + 1] : undefined;
  if (!nombre) throw new Error('Falta --nombre "Nombre del comercio"');
  return { nombre };
}

async function main() {
  const { nombre } = leerArgs();
  const prisma = new PrismaClient();
  try {
    const existente = await prisma.sucursal.findFirst({ where: { nombre } });
    if (existente) {
      console.log(`Ya existe una sucursal con ese nombre: ${existente.id}`);
      return;
    }
    const sucursal = await prisma.sucursal.create({ data: { nombre } });
    console.log(`Sucursal creada.\n  id:     ${sucursal.id}\n  nombre: ${sucursal.nombre}`);
    console.log(`\nUsala como sucursalId al registrar el primer ADMIN (POST /auth/register).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exitCode = 1;
});
