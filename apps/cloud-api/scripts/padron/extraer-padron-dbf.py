# -*- coding: utf-8 -*-
r"""
Fase 10 (herramienta de negocio, no ligada a un cliente puntual): extrae un
padron de articulos a partir de tablas articulo.dbf de comercios que corren
el sistema FoxPro de Hugo (una carpeta por comercio, cada una con su propio
articulo.dbf). Deduplica GLOBALMENTE por codigo de barras entre todos los
comercios y escribe un .xlsx en el mismo formato que ya lee
`apps/cloud-api/scripts/importar-catalogo.mjs` (Fase 10.2) — no hace falta
tocar ese importador para usar la salida de este script.

Requiere: Python 3, `dbfread` y `openpyxl` (pip install dbfread openpyxl).

Uso:
    python extraer-padron-dbf.py --entrada "F:\ruta\con\subcarpetas" --salida "padron.xlsx"

Cada subcarpeta de --entrada debe tener un articulo.dbf (formato Visual
FoxPro, codepage cp850). Carpetas sin ese archivo se saltean sin error.

Reglas (ver ADR de la Fase 10 "padron de articulos multi-comercio"):
  - codigo: BARRA si es numerico de 4 a 14 digitos, si no CODIGO en las
    mismas condiciones. Fila sin codigo valido o sin descripcion se descarta.
  - Deduplicacion por codigo: descripcion y rubro = la forma MAS FRECUENTE
    entre todas las apariciones (normalizando mayus/minus); precio/costo =
    los de la aparicion con FECHA mas reciente; IVA = el mas cercano a las
    alicuotas argentinas validas (0/10.5/21/27), tambien por frecuencia.
  - Rubro: se limpia basura de encabezado (digitos/puntos sueltos de
    exportaciones viejas) y se fusionan variantes truncadas (ej. "LIMPIEZ"
    -> "LIMPIEZA") cuando una es prefijo de la otra con diferencia <= 3
    caracteres y la version larga es mas frecuente.
  - Columna extra "Comercios de origen": en cuantos comercios distintos
    aparecia ese codigo — util para priorizar/curar despues (mas comercios
    = mas confianza en que es un producto real y no un error de carga).
  - Stock siempre 0, Activo siempre "S" (es un padron de referencia, no
    inventario real de nadie).
"""
import argparse
import csv
import io
import os
import re
from collections import Counter, defaultdict

from dbfread import DBF
import openpyxl

IVAS_VALIDAS = {0.0, 10.5, 21.0, 27.0}
COLUMNAS_SALIDA = [
    "Código de barras", "Descripción", "Rubro", "Precio Costo", "% IVA",
    "Precio Venta", "Stock", "Activo", "Comercios de origen",
]


def es_codigo_valido(s):
    return bool(s) and re.fullmatch(r"\d{4,14}", s.strip()) is not None


def limpiar_texto(s):
    if s is None:
        return ""
    return re.sub(r"\s+", " ", str(s)).strip()


def normalizar_rubro_base(s):
    s = s.strip()
    s = s.replace("\u00d0", "\u00d1").replace("\u00f0", "\u00f1")  # Ð/ð -> Ñ/ñ (mis-decode puntual visto en el dato real)
    s = re.sub(r"^[^A-Za-z\u00c0-\u00ff]+", "", s)
    s = re.sub(r"[.\-]+$", "", s)
    return re.sub(r"\s+", " ", s).strip()


def iva_mas_cercano(pct):
    if pct is None:
        return 21.0
    return min(IVAS_VALIDAS, key=lambda v: abs(v - pct))


def extraer_filas(carpeta_base):
    """Lee todos los articulo.dbf bajo carpeta_base. Devuelve una lista de dicts crudos."""
    filas = []
    descartadas = 0
    comercios_ok = 0
    comercios_error = []
    for carpeta in sorted(os.listdir(carpeta_base)):
        ruta = os.path.join(carpeta_base, carpeta, "articulo.dbf")
        if not os.path.exists(ruta):
            continue
        try:
            tabla = DBF(ruta, encoding="cp850", ignore_missing_memofile=True)
        except Exception as e:  # noqa: BLE001 — no se pudo ni abrir la tabla
            comercios_error.append((carpeta, f"no se pudo abrir: {e}"))
            continue

        filas_de_error = 0
        for reg in tabla:
            try:
                codigo_raw = limpiar_texto(reg.get("CODIGO"))
                barra_raw = limpiar_texto(reg.get("BARRA"))
                descripcion = limpiar_texto(reg.get("DETALLE"))
                rubro = limpiar_texto(reg.get("DETARUB"))
                precio = reg.get("PRECIO")
                costo = reg.get("PCOSTO")
                detaiva = limpiar_texto(reg.get("DETAIVA"))
                fecha = reg.get("FECHA")

                codigo = barra_raw if es_codigo_valido(barra_raw) else (
                    codigo_raw if es_codigo_valido(codigo_raw) else None
                )
                if not codigo or not descripcion or precio is None or precio <= 0:
                    descartadas += 1
                    continue

                # \d+ al inicio evita que un "." o "," suelto de exportaciones viejas
                # (ej. ".21.00 %") arme un numero invalido con dos separadores.
                iva_pct = None
                m = re.search(r"(\d+(?:[.,]\d+)?)", detaiva)
                if m:
                    try:
                        iva_pct = float(m.group(1).replace(",", "."))
                    except ValueError:
                        iva_pct = None

                filas.append({
                    "codigo": codigo,
                    "descripcion": descripcion,
                    "rubro": rubro,
                    "precio": float(precio),
                    "costo": float(costo) if costo is not None else 0.0,
                    "iva_pct": iva_pct,
                    "fecha": fecha.isoformat() if fecha else "",
                    "comercio": carpeta,
                })
            except Exception:  # noqa: BLE001 — una fila rota no tira toda la carpeta
                filas_de_error += 1
                continue
        comercios_ok += 1
        if filas_de_error:
            comercios_error.append((carpeta, f"{filas_de_error} fila(s) descartada(s) por error de formato"))
    return filas, comercios_ok, comercios_error, descartadas


def construir_normalizador_de_rubros(filas):
    """Arma un mapa 'rubro crudo' -> 'rubro canonico' fusionando variantes truncadas."""
    formas_por_upper = defaultdict(Counter)
    frecuencia_upper = Counter()
    for f in filas:
        base = normalizar_rubro_base(f["rubro"])
        if not base:
            continue
        upper = base.upper()
        formas_por_upper[upper][base] += 1
        frecuencia_upper[upper] += 1

    orden = [u for u, _ in frecuencia_upper.most_common()]
    fusion = {}
    for corto in orden:
        if corto in fusion:
            continue
        for largo in orden:
            if largo == corto or largo in fusion:
                continue
            if largo.startswith(corto) and 0 < len(largo) - len(corto) <= 3:
                if frecuencia_upper[largo] >= frecuencia_upper[corto]:
                    fusion[corto] = largo
                break

    def destino_final(upper):
        visto = set()
        while upper in fusion and upper not in visto:
            visto.add(upper)
            upper = fusion[upper]
        return upper

    formas_finales = defaultdict(Counter)
    for upper, formas in formas_por_upper.items():
        formas_finales[destino_final(upper)].update(formas)
    nombre_bonito = {u: formas.most_common(1)[0][0] for u, formas in formas_finales.items()}

    def normalizar(rubro_crudo):
        base = normalizar_rubro_base(rubro_crudo)
        if not base:
            return "Sin Clasificar"
        return nombre_bonito.get(destino_final(base.upper()), base)

    return normalizar


def canonicalizar(filas):
    normalizar_rubro = construir_normalizador_de_rubros(filas)
    grupos = defaultdict(list)
    for f in filas:
        grupos[f["codigo"]].append(f)

    registros = []
    for codigo, fs in grupos.items():
        descripciones = Counter(f["descripcion"].strip().upper() for f in fs)
        norm_ganadora = descripciones.most_common(1)[0][0]
        originales = [f["descripcion"] for f in fs if f["descripcion"].strip().upper() == norm_ganadora]
        descripcion = Counter(originales).most_common(1)[0][0]

        rubro = Counter(normalizar_rubro(f["rubro"]) for f in fs).most_common(1)[0][0]

        ivas = Counter(iva_mas_cercano(f["iva_pct"]) for f in fs if f["iva_pct"])
        iva_pct = ivas.most_common(1)[0][0] if ivas else 21.0

        mas_reciente = sorted(fs, key=lambda f: f["fecha"])[-1]

        registros.append({
            "codigo": codigo,
            "descripcion": descripcion,
            "rubro": rubro,
            "precio": round(mas_reciente["precio"], 2),
            "costo": round(mas_reciente["costo"], 2),
            "iva_pct": iva_pct,
            "veces_visto": len(set(f["comercio"] for f in fs)),
        })

    registros.sort(key=lambda r: (-r["veces_visto"], r["descripcion"]))
    return registros


def escribir_xlsx(registros, ruta_salida):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Padron de articulos"
    ws.append(COLUMNAS_SALIDA)
    for r in registros:
        ws.append([
            r["codigo"], r["descripcion"], r["rubro"], r["costo"], r["iva_pct"],
            r["precio"], 0, "S", r["veces_visto"],
        ])
    wb.save(ruta_salida)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--entrada", required=True, help="Carpeta con las subcarpetas por comercio (cada una con articulo.dbf)")
    ap.add_argument("--salida", required=True, help="Ruta del .xlsx de salida")
    args = ap.parse_args()

    filas, comercios_ok, comercios_error, descartadas = extraer_filas(args.entrada)
    print(f"Comercios procesados OK: {comercios_ok}")
    if comercios_error:
        print(f"Comercios con error: {len(comercios_error)}")
        for c, e in comercios_error:
            print(f"  {c}: {e}")
    print(f"Filas validas: {len(filas)} | descartadas (sin codigo/descripcion/precio): {descartadas}")

    registros = canonicalizar(filas)
    print(f"Codigos unicos (registros finales): {len(registros)}")
    rubros = Counter(r["rubro"] for r in registros)
    print(f"Rubros distintos: {len(rubros)}")

    escribir_xlsx(registros, args.salida)
    print(f"\nEscrito: {args.salida}")


if __name__ == "__main__":
    main()
