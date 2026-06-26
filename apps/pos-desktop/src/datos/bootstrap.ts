/**
 * Arranque del entorno del POS para desarrollo en el navegador: catálogo demo +
 * repositorios EN MEMORIA + `ServicioDeVenta`. Cuando el POS corra dentro de Tauri
 * se reemplaza esta fábrica por una que use el adaptador SQLite (`EjecutorSql`
 * sobre `@tauri-apps/plugin-sql`); la UI no cambia.
 */
import {
  crearRepositoriosMemoria,
  ServicioDeFacturacion,
  ServicioDeVenta,
  type ConfiguracionComercio,
} from "@nexosoft/app";
import { MockServicioFiscal } from "@nexosoft/fiscal";
import {
  ALICUOTAS_IVA,
  Cantidad,
  CondicionIva,
  crearArticulo,
  crearExistencia,
  ModoPrecio,
  Money,
  resolverPrecioArticulo,
  UnidadDeMedida,
  type AlicuotaIva,
  type Articulo,
  type Existencia,
  type PrecioArticulo,
} from "@nexosoft/domain";

const DEPOSITO = "principal";
const LISTA = "minorista";

interface DefProducto {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  /** Precio final IVA incluido. */
  readonly precio: string;
  readonly costo: string;
  readonly alicuota: AlicuotaIva;
  readonly stock: string;
}

const DEFS: readonly DefProducto[] = [
  {
    id: "gaseosa",
    codigo: "7790001",
    descripcion: "Gaseosa 1,5 L",
    precio: "1850.00",
    costo: "1100",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "40",
  },
  {
    id: "agua",
    codigo: "7790002",
    descripcion: "Agua mineral 500 ml",
    precio: "900.00",
    costo: "520",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "60",
  },
  {
    id: "alfajor",
    codigo: "7790003",
    descripcion: "Alfajor triple",
    precio: "1200.00",
    costo: "700",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "50",
  },
  {
    id: "cafe",
    codigo: "7790004",
    descripcion: "Café molido 250 g",
    precio: "4300.00",
    costo: "2800",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "25",
  },
  {
    id: "leche",
    codigo: "7790005",
    descripcion: "Leche entera 1 L",
    precio: "1350.00",
    costo: "900",
    alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
    stock: "35",
  },
  {
    id: "pan",
    codigo: "7790006",
    descripcion: "Pan lactal",
    precio: "2100.00",
    costo: "1300",
    alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO,
    stock: "20",
  },
  {
    id: "yerba",
    codigo: "7790007",
    descripcion: "Yerba mate 1 kg",
    precio: "3800.00",
    costo: "2500",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "30",
  },
  {
    id: "galletitas",
    codigo: "7790008",
    descripcion: "Galletitas dulces",
    precio: "1500.00",
    costo: "850",
    alicuota: ALICUOTAS_IVA.VEINTIUNO,
    stock: "45",
  },
];

export interface ProductoCatalogo {
  readonly articulo: Articulo;
  /** Precio final IVA incluido, ya resuelto para la lista por defecto. */
  readonly precioFinal: Money;
}

export interface EntornoPos {
  readonly servicio: ServicioDeVenta;
  readonly facturacion: ServicioDeFacturacion;
  readonly config: ConfiguracionComercio;
  readonly catalogo: readonly ProductoCatalogo[];
}

export function crearEntornoPos(): EntornoPos {
  const articulos: Articulo[] = [];
  const precios: PrecioArticulo[] = [];
  const existencias: Existencia[] = [];

  for (const d of DEFS) {
    const articulo = crearArticulo({
      id: d.id,
      codigoInterno: d.codigo,
      descripcion: d.descripcion,
      unidadDeMedida: UnidadDeMedida.Unidad,
      costoNeto: Money.desde(d.costo),
      alicuotaIva: d.alicuota,
    });
    articulos.push(articulo);
    precios.push({
      articuloId: d.id,
      listaId: LISTA,
      modo: ModoPrecio.Manual,
      precioManual: Money.desde(d.precio),
    });
    existencias.push(
      crearExistencia({
        articuloId: d.id,
        depositoId: DEPOSITO,
        cantidad: Cantidad.de(d.stock),
      }),
    );
  }

  const repos = crearRepositoriosMemoria({ articulos, precios, existencias });
  const config: ConfiguracionComercio = {
    cuit: "30-71234567-8",
    razonSocial: "NexoSoft Almacén (demo)",
    condicionIvaEmisor: CondicionIva.ResponsableInscripto,
    puntoDeVenta: 1,
    depositoPorDefectoId: DEPOSITO,
    listaPredeterminadaId: LISTA,
    preciosIncluyenIva: true,
    permitirStockNegativo: false,
  };

  const catalogo: ProductoCatalogo[] = articulos.map((articulo, i) => {
    const precio = precios[i];
    return {
      articulo,
      precioFinal:
        precio !== undefined
          ? resolverPrecioArticulo(precio, articulo, {
              condicionEmisor: config.condicionIvaEmisor,
            })
          : Money.cero(),
    };
  });

  return {
    servicio: new ServicioDeVenta(repos, config),
    facturacion: new ServicioDeFacturacion(repos, config, new MockServicioFiscal()),
    config,
    catalogo,
  };
}
