# Scripts (Python, fuera del build de Vite)

## `generar-catalogo-demo.py`

Genera `../src/datos/catalogo-demo-711.json` — el catálogo que usan la
demo del navegador y el "modo demo" del instalable (`AppDemo`) — a partir
del Excel real de un cliente (mismo formato que ya lee el importador de la
Fase 10.2, `apps/cloud-api/scripts/importar-catalogo.mjs`).

```bash
pip install pandas openpyxl
python generar-catalogo-demo.py --entrada "../../../Migrar Articulos.xlsx" --salida "../src/datos/catalogo-demo-711.json"
```

**Antes de regenerar con el Excel de OTRO cliente**, revisar `IDS_ESPECIALES`
en el script: 5 códigos quedan fijados a los ids `alfajor`/`gaseosa`/`cafe`/
`leche`/`pan` porque el combo demo, `PROMOS_DEMO` y los perecederos con lotes
(`sync/cliente-stock-simulado.ts`, `sync/cliente-catalogo-admin-simulado.ts`)
los referencian por nombre — hay que elegir 5 códigos reales del nuevo Excel
que cumplan esos roles y actualizar el mapa.
