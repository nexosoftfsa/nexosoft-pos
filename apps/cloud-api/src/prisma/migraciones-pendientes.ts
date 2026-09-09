/**
 * Avisa al arrancar si la base quedó atrás del código.
 *
 * Una migración sin aplicar no se nota al arrancar: el servidor levanta bien y
 * recién falla cuando alguien toca la pantalla que usa la columna nueva, con un
 * "Internal server error" que no dice nada. El 9/9/2026 eso costó descubrir,
 * cinco días después, que la caja tiraba 500 y que las ventas no llegaban a los
 * reportes — las dos cosas por migraciones pendientes en una base de desarrollo.
 *
 * En una instalación de comercio el actualizador las corre solo, así que esto
 * apunta sobre todo a quien levanta el servidor desde el repo. Igual se avisa
 * siempre: si en un comercio quedaran pendientes, es exactamente el dato que
 * haría falta tener a mano.
 *
 * **No corta el arranque.** Un servidor que avisa y funciona a medias es mejor
 * que uno que no arranca: puede haber pendiente una migración que no toque nada
 * de lo que ese comercio usa, y dejarlo sin vender sería peor que el problema.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Las que están en disco y no en la base, en orden cronológico. */
export function migracionesPendientes(
  enDisco: readonly string[],
  aplicadas: readonly string[],
): string[] {
  const ya = new Set(aplicadas);
  return enDisco.filter((m) => !ya.has(m)).sort();
}

/**
 * Carpetas de migración en disco. Vacío si no se puede leer: `prisma/` viaja
 * con el paquete standalone, pero si por lo que sea no está, el chequeo se
 * saltea en vez de romper el arranque.
 */
export function migracionesEnDisco(raizPrisma: string): string[] {
  try {
    if (!existsSync(raizPrisma)) return [];
    return readdirSync(raizPrisma, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** El texto que se loguea. Separado para poder testearlo. */
export function avisoDeMigracionesPendientes(pendientes: readonly string[]): string {
  return [
    `La base de datos está atrás del código: hay ${pendientes.length} migración(es) sin aplicar.`,
    'Mientras tanto, las pantallas que usen lo nuevo van a fallar con "Internal server error"',
    'y las ventas pueden no llegar a los reportes.',
    '',
    ...pendientes.map((m) => `  - ${m}`),
    '',
    'Se aplican con:  pnpm --filter @nexosoft/cloud-api exec prisma migrate deploy',
  ].join('\n');
}

interface ConsultaCruda {
  $queryRawUnsafe<T>(sql: string): Promise<T>;
}

/**
 * Consulta la tabla de control de Prisma y devuelve lo que falta aplicar.
 *
 * Devuelve `[]` ante cualquier problema —base recién creada sin la tabla de
 * control, permisos, lo que sea—: esto es un aviso, no un guardián.
 */
export async function buscarMigracionesPendientes(
  prisma: ConsultaCruda,
  raizPrisma: string,
): Promise<string[]> {
  const enDisco = migracionesEnDisco(raizPrisma);
  if (enDisco.length === 0) return [];
  try {
    const filas = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL',
    );
    return migracionesPendientes(
      enDisco,
      filas.map((f) => f.migration_name),
    );
  } catch {
    return [];
  }
}
