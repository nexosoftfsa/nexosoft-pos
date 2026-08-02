# Padrón de artículos (herramienta de negocio)

No está ligado a ningún cliente puntual de NexoSoft: es un catálogo de
referencia armado a partir de datos reales de ~85 comercios que corren el
sistema FoxPro de Hugo (una carpeta por comercio, con su propio
`articulo.dbf`). Sirve como pool de productos precargados para acelerar el
alta de futuros clientes (rubro almacén/kiosco/autoservicio).

Ver [ADR-0045](../../../../docs/adr/0045-padron-de-articulos-multi-comercio.md)
para el detalle de las decisiones (por qué `articulo.dbf` y no `fdetalle.dbf`,
cómo se deduplica, por qué queda separado del catálogo de un cliente puntual).

## Requisitos

Python 3 + `pip install dbfread openpyxl` (no hace falta nada del monorepo
Node/TS — es una herramienta aparte).

## Uso

```bash
python extraer-padron-dbf.py --entrada "C:\ruta\con\una\carpeta\por\comercio" --salida "padron.xlsx"
```

Cada subcarpeta de `--entrada` debe tener un `articulo.dbf` (Visual FoxPro,
codepage `cp850`); las que no lo tienen se saltean sin error. La salida es un
`.xlsx` en el **mismo formato de columnas** que ya lee
`apps/cloud-api/scripts/importar-catalogo.mjs` (Fase 10.2) — se puede importar
al catálogo de un cliente nuevo sin escribir código nuevo:

```bash
corepack pnpm --filter @nexosoft/cloud-api importar:catalogo -- \
  --archivo "ruta/al/padron.xlsx" --email admin@... --password ... --dry-run
```

## Si Hugo pasa más carpetas DBF en el futuro

Volver a correr el script apuntando `--entrada` a la carpeta que las
contenga (puede ser la misma de siempre con carpetas nuevas adentro, o una
carpeta distinta) — es idempotente en el sentido de que siempre parte de cero
y recalcula todo el padrón, no hace falta ningún estado previo.
