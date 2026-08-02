# -*- coding: utf-8 -*-
r"""
Fase 10: genera `src/datos/catalogo-demo-711.json` a partir del catálogo real
de un cliente (Excel, mismo formato que lee el importador de la Fase 10.2 —
columnas "Código de barras/Descripción/Rubro/Precio Costo/% IVA/Precio
Venta/Stock"). Reemplaza el catálogo demo inventado por productos y precios
reales, para que la maqueta/demo no muestre datos ficticios.

5 códigos quedan mapeados a IDS FIJOS ("alfajor"/"gaseosa"/"cafe"/"leche"/
"pan") porque otros archivos demo los referencian por nombre (el combo
"Combo Merienda", `PROMOS_DEMO` en componentes/promos.ts, y los perecederos
con lotes en sync/cliente-stock-simulado.ts y
sync/cliente-catalogo-admin-simulado.ts). Si se regenera con el Excel de
OTRO cliente, hay que elegir 5 códigos reales de ese archivo que tengan
sentido para esos roles (una gaseosa, un alfajor, un café, una leche y un pan)
y actualizar `IDS_ESPECIALES` más abajo.

Requiere: Python 3, `pip install pandas openpyxl`.

Uso:
    python generar-catalogo-demo.py --entrada "../../Migrar Articulos.xlsx" --salida "../src/datos/catalogo-demo-711.json"
"""
import argparse
import json

import pandas as pd

# Elegidos a mano del catálogo real del cliente de la Fase 10 (stock positivo,
# precio razonable, rubro coherente con el rol que cumplen en la demo).
IDS_ESPECIALES = {
    "7798094220956": "alfajor",  # ALFAJOR GENIO TRIPLE NEGRO
    "7790895005916": "gaseosa",  # COCA COLA RETORNABLE 1.5L
    "7790150100677": "cafe",     # CAFE LV CLASICO INS 50G
    "7790036001326": "leche",    # LECHE ENTERA BAGGIO LATTE 1 L
    "7798335250087": "pan",      # LA REINA PAN LACTAL BLANCO
}


def generar(entrada: str, salida: str) -> int:
    df = pd.read_excel(entrada, sheet_name="Artículos (Minorista)")

    filas = []
    for _, r in df.iterrows():
        codigo = str(r["Código de barras"]).strip()
        stock = r["Stock"]
        stock_final = int(stock) if stock and stock > 0 else 5  # sin stock negativo/cero en la demo
        filas.append({
            "id": IDS_ESPECIALES.get(codigo, codigo),
            "codigo": codigo,
            "descripcion": str(r["Descripción"]).strip(),
            "precio": f"{float(r['Precio Venta']):.2f}",
            "costo": f"{float(r['Precio Costo']):.2f}",
            "porcentajeIva": int(r["% IVA"]),
            "stock": str(stock_final),
            "rubro": str(r["Rubro"]).strip() or "Sin Clasificar",
        })

    with open(salida, "w", encoding="utf-8") as f:
        json.dump(filas, f, ensure_ascii=False, indent=2)

    return len(filas)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--entrada", required=True, help="Excel del cliente (mismo formato del importador de la 10.2)")
    ap.add_argument("--salida", required=True, help="Ruta del catalogo-demo-*.json de salida")
    args = ap.parse_args()

    n = generar(args.entrada, args.salida)
    ids_especiales_encontrados = sorted(set(IDS_ESPECIALES.values()))
    print(f"{n} artículos escritos en {args.salida}")
    print(f"ids especiales a verificar que existan en la salida: {ids_especiales_encontrados}")


if __name__ == "__main__":
    main()
