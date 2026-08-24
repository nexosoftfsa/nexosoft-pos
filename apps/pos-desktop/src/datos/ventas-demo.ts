/**
 * Historial de ventas ficticias para el modo DEMO (sin servidor).
 *
 * El modo demo servía para mostrar la pantalla de venta, pero todo lo que
 * mira hacia atrás —Reportes, Comprobantes— devolvía números fijos inventados
 * a mano, que no se movían al cambiar el rango y no tenían nada que ver con
 * el catálogo. Acá se generan ventas de verdad sobre los 711 artículos del
 * catálogo demo, y de ahí salen todos los reportes.
 *
 * Determinístico a propósito (PRNG con semilla fija): el demo tiene que
 * mostrar siempre lo mismo. Si los números cambiaran en cada recarga, no se
 * podría usar para explicarle nada a nadie ni para comparar dos pantallas.
 */
import catalogoDemo711 from "./catalogo-demo-711.json";

/** Días de historia que se generan hacia atrás desde hoy. */
export const DIAS_DE_HISTORIA = 30;

export interface LineaVentaDemo {
  readonly productoId: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly rubro: string;
  readonly cantidad: number;
  readonly unitario: number;
  readonly costoUnitario: number;
  readonly total: number;
}

export interface VentaDemo {
  readonly id: string;
  readonly numeroTicket: number;
  /** ISO 8601 completo (con hora), como lo devuelve el servidor. */
  readonly fecha: string;
  /** `YYYY-MM-DD`, para agrupar por día sin pelear con zonas horarias. */
  readonly dia: string;
  readonly medioPago: string;
  readonly total: number;
  readonly descuento: number;
  readonly lineas: readonly LineaVentaDemo[];
}

interface ArticuloDemo {
  readonly id: string;
  readonly codigo: string;
  readonly descripcion: string;
  readonly precio: string;
  readonly costo: string;
  readonly rubro: string;
}

/**
 * Generador congruencial lineal. No hace falta nada mejor: lo único que se le
 * pide es repetir siempre la misma secuencia.
 */
function prng(semilla: number): () => number {
  let estado = semilla;
  return () => {
    estado = (estado * 1664525 + 1013904223) % 4294967296;
    return estado / 4294967296;
  };
}

function aIsoDia(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

const MEDIOS: ReadonlyArray<{ medio: string; peso: number }> = [
  { medio: "EFECTIVO", peso: 46 },
  { medio: "TARJETA_DEBITO", peso: 20 },
  { medio: "TARJETA_CREDITO", peso: 14 },
  { medio: "MERCADOPAGO_QR", peso: 12 },
  { medio: "COMBINADO", peso: 5 },
  { medio: "CUENTA_CORRIENTE", peso: 3 },
];

function elegirMedio(r: number): string {
  const total = MEDIOS.reduce((a, m) => a + m.peso, 0);
  let acumulado = 0;
  for (const m of MEDIOS) {
    acumulado += m.peso / total;
    if (r <= acumulado) return m.medio;
  }
  return "EFECTIVO";
}

/**
 * Cuántas ventas tiene un día. El domingo el comercio cierra y los lunes son
 * flojos: además de ser realista, deja ver el conteo por "días trabajados" de
 * los reportes, que con un historial parejo no se notaría.
 */
function ventasDelDia(fecha: Date, r: () => number): number {
  const dia = fecha.getDay();
  if (dia === 0) return 0;
  const base = dia === 1 ? 14 : dia === 6 ? 38 : 26;
  return Math.round(base * (0.75 + r() * 0.5));
}

let cache: VentaDemo[] | null = null;

/**
 * Las ventas del demo. Se calculan una sola vez por sesión: son unas 700
 * ventas con sus líneas y no tiene sentido rehacerlas en cada pantalla.
 */
export function ventasDemo(hoy: Date = new Date()): VentaDemo[] {
  if (cache !== null) return cache;

  const articulos = (catalogoDemo711 as ArticuloDemo[]).filter(
    (a) => Number(a.precio) > 0 && Number(a.costo) > 0,
  );
  const r = prng(20260824);
  const ventas: VentaDemo[] = [];
  let ticket = 1000;

  for (let atras = DIAS_DE_HISTORIA - 1; atras >= 0; atras--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - atras);
    const cuantas = ventasDelDia(fecha, r);

    for (let i = 0; i < cuantas; i++) {
      const lineas: LineaVentaDemo[] = [];
      const cuantosItems = 1 + Math.floor(r() * 5);
      for (let j = 0; j < cuantosItems; j++) {
        const art = articulos[Math.floor(r() * articulos.length)];
        if (art === undefined) continue;
        const cantidad = 1 + Math.floor(r() * 3);
        const unitario = Number(art.precio);
        lineas.push({
          productoId: art.id,
          codigo: art.codigo,
          descripcion: art.descripcion,
          rubro: art.rubro,
          cantidad,
          unitario,
          costoUnitario: Number(art.costo),
          total: Math.round(unitario * cantidad * 100) / 100,
        });
      }
      if (lineas.length === 0) continue;

      const bruto = lineas.reduce((a, l) => a + l.total, 0);
      // Un descuento ocasional, para que el KPI de descuentos no sea siempre 0.
      const descuento = r() < 0.12 ? Math.round(bruto * 0.1 * 100) / 100 : 0;
      // Horario comercial: entre las 8 y las 20.
      const hora = 8 + Math.floor(r() * 12);
      const minuto = Math.floor(r() * 60);
      const conHora = new Date(fecha);
      conHora.setHours(hora, minuto, 0, 0);

      ticket += 1;
      ventas.push({
        id: `demo-${ticket}`,
        numeroTicket: ticket,
        fecha: conHora.toISOString(),
        dia: aIsoDia(fecha),
        medioPago: elegirMedio(r()),
        total: Math.round((bruto - descuento) * 100) / 100,
        descuento,
        lineas,
      });
    }
  }

  cache = ventas;
  return ventas;
}

/**
 * Ventas dentro de un rango `YYYY-MM-DD` inclusive por los dos lados. Se
 * compara por día y no por timestamp: el rango que manda la UI son fechas, y
 * comparar contra una hora dejaría afuera media jornada del último día.
 */
export function ventasEntre(desde: string, hasta: string, hoy?: Date): VentaDemo[] {
  const d = desde.slice(0, 10);
  const h = hasta.slice(0, 10);
  return ventasDemo(hoy).filter((v) => v.dia >= d && v.dia <= h);
}
