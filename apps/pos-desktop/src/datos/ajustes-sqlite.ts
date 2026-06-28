/**
 * Ajustes de la TERMINAL (clave/valor) en SQLite. Hoy guarda la URL del servidor
 * de sucursal; es extensible a otros ajustes locales de la caja. Los datos del
 * comercio (CUIT, razón social, etc.) viven aparte en `comercio_config`.
 */
import type { EjecutorSql, Fila } from "@nexosoft/app";

export const URL_SERVIDOR_DEFECTO = "http://localhost:3000/api/v1";

const CLAVE_SERVIDOR = "servidor_url";

export const SENTENCIA_TABLA_AJUSTES = `CREATE TABLE IF NOT EXISTS ajuste (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
)`;

export async function crearTablaAjustes(ejecutor: EjecutorSql): Promise<void> {
  await ejecutor.ejecutar(SENTENCIA_TABLA_AJUSTES);
}

export async function leerAjuste(ejecutor: EjecutorSql, clave: string): Promise<string | null> {
  const filas = await ejecutor.consultar<Fila & { valor: string }>(
    "SELECT valor FROM ajuste WHERE clave = ?",
    [clave],
  );
  return filas[0]?.valor ?? null;
}

export async function guardarAjuste(ejecutor: EjecutorSql, clave: string, valor: string): Promise<void> {
  await ejecutor.ejecutar(
    `INSERT INTO ajuste (clave, valor) VALUES (?, ?)
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
    [clave, valor],
  );
}

/** URL del servidor de sucursal (o el default si no se configuró). */
export async function leerServidorUrl(ejecutor: EjecutorSql): Promise<string> {
  return (await leerAjuste(ejecutor, CLAVE_SERVIDOR)) ?? URL_SERVIDOR_DEFECTO;
}

export async function guardarServidorUrl(ejecutor: EjecutorSql, url: string): Promise<void> {
  await guardarAjuste(ejecutor, CLAVE_SERVIDOR, url);
}
