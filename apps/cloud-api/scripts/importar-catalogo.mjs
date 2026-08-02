/**
 * Fase 10.2: importa un catálogo exportado por el sistema anterior de un
 * comercio (Excel) contra un cloud-api YA CORRIENDO (real o de prueba).
 *
 * Reusable para otros clientes: lee las columnas por NOMBRE de encabezado
 * (no por posición), así que alcanza con que el Excel tenga las mismas
 * columnas aunque el orden cambie. Si un cliente exporta con nombres de
 * columna distintos, ajustar el mapa `COLUMNAS` de abajo.
 *
 * Uso:
 *   corepack pnpm --filter @nexosoft/cloud-api importar:catalogo -- \
 *     --archivo "../../Migrar Articulos.xlsx" --api http://localhost:3000/api/v1 \
 *     --email duenio@nexo.com --password ... [--dry-run]
 *
 * Idempotente: un producto cuyo código ya existe se OMITE (no se pisa ni se
 * duplica el stock). Se puede volver a correr después de corregir errores.
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const ExcelJS = require('exceljs');
const { mapearArticulo } = require('../dist/catalogo/importar-articulos.js');

// ─── Columnas del archivo real (711 artículos, ver ADR de la Fase 10.2) ────
const COLUMNAS = {
  codigo: 'Código de barras',
  descripcion: 'Descripción',
  rubro: 'Rubro',
  precioCosto: 'Precio Costo',
  porcentajeIva: '% IVA',
  precioVenta: 'Precio Venta',
  stock: 'Stock',
  activo: 'Activo',
};

function leerArgs() {
  const args = process.argv.slice(2);
  const get = (nombre, porDefecto) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 ? args[i + 1] : porDefecto;
  };
  return {
    archivo: resolve(__dirname, get('archivo', '../../../Migrar Articulos.xlsx')),
    api: get('api', 'http://localhost:3000/api/v1'),
    email: get('email'),
    password: get('password'),
    dryRun: args.includes('--dry-run'),
  };
}

async function leerFilas(archivo) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const hoja = wb.worksheets[0];
  const encabezados = {};
  hoja.getRow(1).eachCell((celda, col) => {
    encabezados[String(celda.value).trim()] = col;
  });
  for (const [clave, nombreColumna] of Object.entries(COLUMNAS)) {
    if (!(nombreColumna in encabezados)) {
      throw new Error(`Falta la columna "${nombreColumna}" (esperada para "${clave}") en ${archivo}`);
    }
  }
  const filas = [];
  hoja.eachRow((row, numero) => {
    if (numero === 1) return; // encabezado
    const val = (clave) => row.getCell(encabezados[COLUMNAS[clave]]).value;
    filas.push({
      numeroFila: numero,
      codigo: val('codigo'),
      descripcion: String(val('descripcion') ?? '').trim(),
      rubro: val('rubro') ? String(val('rubro')).trim() : null,
      precioCosto: Number(val('precioCosto') ?? 0),
      porcentajeIva: Number(val('porcentajeIva') ?? 0),
      precioVenta: Number(val('precioVenta') ?? 0),
      stock: Number(val('stock') ?? 0),
      activo: val('activo') ? String(val('activo')).trim() : 'S',
    });
  });
  return filas;
}

async function api(base, metodo, ruta, token, body) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, json };
}

async function main() {
  const { archivo, api: base, email, password, dryRun } = leerArgs();
  console.log(`\nImportador de catálogo — Fase 10.2`);
  console.log(`Archivo: ${archivo}`);
  console.log(`API: ${base}${dryRun ? '  (DRY-RUN: no se escribe nada)' : ''}`);

  const filas = await leerFilas(archivo);
  console.log(`Filas leídas: ${filas.length}\n`);

  // ─── Mapear todas las filas primero: separa errores de datos del I/O ────
  const mapeados = [];
  const erroresMapeo = [];
  for (const fila of filas) {
    try {
      mapeados.push({ fila, articulo: mapearArticulo(fila) });
    } catch (e) {
      erroresMapeo.push({ numeroFila: fila.numeroFila, codigo: fila.codigo, motivo: e.message });
    }
  }
  if (erroresMapeo.length > 0) {
    console.log(`⚠ ${erroresMapeo.length} fila(s) con error de datos (no se importan):`);
    for (const e of erroresMapeo) console.log(`  fila ${e.numeroFila} (código ${e.codigo}): ${e.motivo}`);
    console.log('');
  }

  const categoriasUsadas = [...new Set(mapeados.map((m) => m.articulo.categoriaNombre))];
  console.log(`Categorías distintas: ${categoriasUsadas.length}`);
  console.log(`Artículos a procesar: ${mapeados.length}\n`);

  if (dryRun) {
    const conAdvertencia = mapeados.filter((m) => m.articulo.advertencias.length > 0);
    console.log(`Artículos con advertencias: ${conAdvertencia.length}`);
    for (const m of conAdvertencia.slice(0, 20)) {
      console.log(`  ${m.articulo.codigo} — ${m.articulo.nombre}: ${m.articulo.advertencias.join(' / ')}`);
    }
    console.log('\nDry-run: no se escribió nada. Corré sin --dry-run para importar de verdad.');
    return;
  }

  if (!email || !password) {
    throw new Error('Faltan --email y --password (usuario ADMIN del servidor destino).');
  }

  // ─── Login ────────────────────────────────────────────────────────────
  const login = await api(base, 'POST', '/auth/login', null, { email, password });
  if (!login.ok) throw new Error(`Login falló (${login.status}): ${JSON.stringify(login.json)}`);
  const token = login.json.accessToken;
  console.log(`Autenticado como ${email}.\n`);

  // ─── Categorías: reusar las que ya existan por nombre ────────────────
  const existentes = (await api(base, 'GET', '/categorias', token)).json;
  const categoriaId = new Map(existentes.map((c) => [c.nombre, c.id]));
  let categoriasCreadas = 0;
  for (const nombre of categoriasUsadas) {
    if (categoriaId.has(nombre)) continue;
    const r = await api(base, 'POST', '/categorias', token, { nombre });
    if (!r.ok) throw new Error(`No se pudo crear la categoría "${nombre}": ${JSON.stringify(r.json)}`);
    categoriaId.set(nombre, r.json.id);
    categoriasCreadas++;
  }
  console.log(`Categorías creadas: ${categoriasCreadas} (de ${categoriasUsadas.length} usadas)\n`);

  // ─── Productos + stock inicial ────────────────────────────────────────
  let creados = 0;
  let yaExistian = 0;
  let stockSembrado = 0;
  const erroresImport = [];

  for (const { articulo } of mapeados) {
    const dto = {
      codigo: articulo.codigo,
      nombre: articulo.nombre,
      precioVenta: articulo.precioVenta,
      precioCosto: articulo.precioCosto,
      tipoIva: articulo.tipoIva,
      categoriaId: categoriaId.get(articulo.categoriaNombre),
    };
    const r = await api(base, 'POST', '/productos', token, dto);
    if (!r.ok) {
      if (r.status === 409) {
        yaExistian++;
        continue;
      }
      erroresImport.push({ codigo: articulo.codigo, motivo: `${r.status}: ${JSON.stringify(r.json)}` });
      continue;
    }
    creados++;

    if (!articulo.activo) {
      await api(base, 'DELETE', `/productos/${r.json.id}`, token);
    }
    if (articulo.stockInicial !== null) {
      const mov = await api(base, 'POST', '/stock/movimientos', token, {
        productoId: r.json.id,
        tipo: 'ENTRADA',
        cantidad: articulo.stockInicial,
      });
      if (mov.ok) stockSembrado++;
    }
  }

  console.log(`\n─── Resumen ───`);
  console.log(`Creados:              ${creados}`);
  console.log(`Ya existían (omitidos): ${yaExistian}`);
  console.log(`Con stock inicial:     ${stockSembrado}`);
  console.log(`Errores de datos:      ${erroresMapeo.length}`);
  console.log(`Errores de importación: ${erroresImport.length}`);
  if (erroresImport.length > 0) {
    for (const e of erroresImport) console.log(`  código ${e.codigo}: ${e.motivo}`);
  }
}

main().catch((e) => {
  console.error('\nERROR:', e.message);
  process.exitCode = 1;
});
