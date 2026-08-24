/**
 * Deja la sucursal y el usuario ADMIN que pidio el instalador, ANDEN O NO las
 * cosas que ya habia en la base. Idempotente: se puede correr mil veces.
 *
 * Reemplaza a la secuencia que usaba el bootstrap (crear-sucursal.mjs +
 * POST /auth/register), que fallaba en silencio en toda reinstalacion:
 *
 *  - La base de datos vive en C:\ProgramData\NexoSoft y NO se borra al
 *    desinstalar (a proposito: son los datos del comercio). Entonces al
 *    reinstalar ya hay usuarios.
 *  - Con usuarios en la base, RegistroGuard cierra POST /auth/register salvo
 *    que haya una sesion de ADMIN — que el instalador no tiene. El alta del
 *    admin devolvia 401 y el bootstrap lo tragaba con un warning amarillo.
 *  - Y si la sucursal ya existia con ese nombre, crear-sucursal.mjs imprimia
 *    "Ya existe..." en un formato que el bootstrap no sabia parsear, asi que
 *    ni siquiera intentaba crear el usuario.
 *
 * Resultado: el instalador pedia usuario y contrasena, decia que todo habia
 * salido bien, y despues el POS rechazaba esas credenciales.
 *
 * Va directo por Prisma y no por HTTP a proposito: es el alta de arranque,
 * corre en la propia PC del servidor, con permisos de administrador, y no hay
 * ninguna sesion previa posible.
 *
 * Uso (parado en dist-servidor):
 *   node scripts\asegurar-admin.mjs --comercio "Almacen Lagus" --usuario admin --password "..."
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PrismaClient } = require('@prisma/client');
const argon2 = require('argon2');

function leerArgs() {
  const args = process.argv.slice(2);
  const valor = (nombre) => {
    const i = args.indexOf(nombre);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const comercio = valor('--comercio');
  const usuario = valor('--usuario');
  const password = valor('--password');
  if (!comercio) throw new Error('Falta --comercio "Nombre del comercio"');
  if (!usuario) throw new Error('Falta --usuario');
  if (!password) throw new Error('Falta --password');
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  return { comercio, usuario, password };
}

/**
 * La sucursal del comercio. Un servidor NexoSoft atiende UNA sucursal
 * (ADR-0019), asi que si ya hay una se reusa aunque el nombre no coincida: no
 * se crea una segunda. Crear otra dejaria al admin nuevo mirando un sistema
 * vacio, con todos los articulos y las ventas colgando de la vieja.
 */
async function asegurarSucursal(prisma, nombre) {
  const existentes = await prisma.sucursal.findMany({ orderBy: { creadaEn: 'asc' } });
  if (existentes.length === 0) {
    const creada = await prisma.sucursal.create({ data: { nombre } });
    return { sucursal: creada, accion: 'SUCURSAL CREADA' };
  }
  const exacta = existentes.find((s) => s.nombre === nombre);
  if (exacta) return { sucursal: exacta, accion: 'SUCURSAL REUSADA' };

  const primera = existentes[0];
  const renombrada = await prisma.sucursal.update({
    where: { id: primera.id },
    data: { nombre },
  });
  return {
    sucursal: renombrada,
    accion: `SUCURSAL RENOMBRADA (era "${primera.nombre}")`,
  };
}

async function main() {
  const { comercio, usuario, password } = leerArgs();
  const prisma = new PrismaClient();
  try {
    const { sucursal, accion } = await asegurarSucursal(prisma, comercio);
    console.log(`${accion}: ${sucursal.nombre} (${sucursal.id})`);

    const passwordHash = await argon2.hash(password);
    const existente = await prisma.usuario.findUnique({ where: { email: usuario } });

    if (existente) {
      // Reinstalar es la via de recuperacion cuando nadie se acuerda de la
      // clave: quien corre el instalador esta fisicamente en la PC del
      // servidor y con permisos de administrador.
      await prisma.usuario.update({
        where: { id: existente.id },
        data: { passwordHash, rol: 'ADMIN', activo: true, sucursalId: sucursal.id },
      });
      console.log(`ADMIN ACTUALIZADO: "${usuario}" (contraseña nueva, rol ADMIN, activo)`);
    } else {
      await prisma.usuario.create({
        data: {
          email: usuario,
          nombreDisplay: comercio,
          passwordHash,
          rol: 'ADMIN',
          activo: true,
          sucursalId: sucursal.id,
        },
      });
      console.log(`ADMIN CREADO: "${usuario}"`);
    }

    const otros = await prisma.usuario.count();
    console.log(`Usuarios en la base: ${otros}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exitCode = 1;
});
