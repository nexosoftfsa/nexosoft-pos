/**
 * Asistente de IA del POS. Igual que ARCA, hardware y pagos, la integración con
 * el LLM real (Google Gemini, ADR-0011) vive **detrás de una interfaz** con un
 * **mock funcional**: el mock responde preguntas del negocio consultando los
 * mismos datos que muestran las pantallas. El adaptador Gemini real se enchufa
 * cuando haya API key + SDK, sin tocar la UI.
 */
import type { ClienteReportes } from "./cliente-reportes";
import type { ClienteStock } from "./cliente-stock";
import type { ClienteCtaCte } from "./cliente-ctacte";
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

/** Puerto: lo que la pantalla del asistente necesita. */
export interface AsistenteIA {
  /** Responde una pregunta en lenguaje natural sobre el comercio. */
  preguntar(texto: string): Promise<string>;
}

/** Intención detectada en la pregunta del usuario (heurística simple). */
export type Intencion = "ventas" | "stock_bajo" | "vencimientos" | "deudores" | "ayuda";

/** Minúsculas y sin tildes, para no depender de cómo se tipeó la pregunta. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/**
 * Reglas de clasificación. Van por PALABRA COMPLETA (`\b`), no por fragmento:
 * con `includes` sobre fragmentos cortos, media conversación normal caía en
 * una intención de datos y la respondía el mock, sin llegar nunca al LLM —
 * "¿qué **deb**ería hacer?" se leía como deudores, "tra**bajo**" como stock
 * bajo, "con**venc**er" como vencimientos, "hace **falta**" como reposición.
 */
const REGLAS: ReadonlyArray<{ intencion: Intencion; patron: RegExp }> = [
  {
    intencion: "vencimientos",
    patron: /\b(vencimientos?|vencidos?|vence[nr]?|caduca[nr]?|caducidad|lotes?)\b|\bpor vencer\b/,
  },
  {
    intencion: "deudores",
    patron: /\b(deudor(es)?|deudas?|fiado|fiados)\b|\bme deben?\b|\bcuentas? corrientes?\b|\bpor cobrar\b/,
  },
  {
    intencion: "stock_bajo",
    patron: /\b(stock|reponer|repongo|reposicion|faltantes?)\b/,
  },
  {
    intencion: "ventas",
    patron: /\b(vendi|vendio|vendimos|vendiste|ventas?|factur(e|o|amos|ado|acion)?|recaud(e|o|amos|ado|acion)?)\b/,
  },
];

/** Clasifica la pregunta en una intención (pura, testeable sin datos). */
export function interpretar(texto: string): Intencion {
  const t = normalizar(texto);
  for (const r of REGLAS) {
    if (r.patron.test(t)) return r.intencion;
  }
  return "ayuda";
}

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** Se muestra cuando falla la consulta al servidor (red caída, servidor apagado, etc.)
 * en vez de dejar que el error crudo (p.ej. "Failed to fetch") llegue al chat. */
const NO_HAY_DATOS = "No hay datos aún: no pude conectarme con el servidor para consultarlos. Probá de nuevo en un momento.";

/** Rango "hoy" en fecha local (YYYY-MM-DD) para los reportes. */
function hoyIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/**
 * Asistente MOCK: responde con los datos reales del comercio (ventas del día,
 * stock bajo, vencimientos, deudores). No usa un LLM; alcanza para la demo y
 * documenta qué haría el asistente real.
 */
export class AsistenteIAMock implements AsistenteIA {
  constructor(
    private readonly fuentes: {
      reportes?: ClienteReportes | undefined;
      stock?: ClienteStock | undefined;
      ctacte?: ClienteCtaCte | undefined;
    },
  ) {}

  async preguntar(texto: string): Promise<string> {
    switch (interpretar(texto)) {
      case "ventas":
        return this.ventasDelDia();
      case "vencimientos":
        return this.vencimientos();
      case "stock_bajo":
        return this.stockBajo();
      case "deudores":
        return this.deudores();
      default:
        return this.ayuda();
    }
  }

  private async ventasDelDia(): Promise<string> {
    if (!this.fuentes.reportes) return "No tengo acceso a los reportes en este momento.";
    try {
      const hoy = hoyIso();
      const r = await this.fuentes.reportes.resumen({ desde: hoy, hasta: hoy });
      if (r.cantidadVentas === 0) return "Todavía no hubo ventas hoy.";
      return `Hoy llevás ${r.cantidadVentas} venta(s) por ${pesos(Number(r.totalVendido))}, con un ticket promedio de ${pesos(Number(r.ticketPromedio))}.`;
    } catch {
      return NO_HAY_DATOS;
    }
  }

  private async vencimientos(): Promise<string> {
    if (!this.fuentes.stock) return "No tengo acceso al stock en este momento.";
    try {
      const v = await this.fuentes.stock.vencimientos(30);
      if (v.length === 0) return "No hay lotes vencidos ni próximos a vencer en los próximos 30 días. 👍";
      const filas = v
        .slice(0, 5)
        .map((a) => {
          const cuando = a.vencido ? "VENCIDO" : `vence en ${a.diasParaVencer} día(s)`;
          return `• ${a.producto.nombre}${a.numero ? ` (lote ${a.numero})` : ""}: ${cuando}, saldo ${a.saldo}`;
        })
        .join("\n");
      return `Atención con ${v.length} lote(s):\n${filas}`;
    } catch {
      return NO_HAY_DATOS;
    }
  }

  private async stockBajo(): Promise<string> {
    if (!this.fuentes.stock) return "No tengo acceso al stock en este momento.";
    try {
      const saldos = await this.fuentes.stock.saldos();
      const bajos = saldos.filter((s) => Number(s.saldo) <= 5).sort((a, b) => Number(a.saldo) - Number(b.saldo));
      if (bajos.length === 0) return "El stock está en niveles razonables, no hay artículos por debajo del mínimo.";
      const filas = bajos.slice(0, 6).map((s) => `• ${s.producto.nombre}: quedan ${s.saldo}`).join("\n");
      return `Conviene reponer ${bajos.length} artículo(s):\n${filas}`;
    } catch {
      return NO_HAY_DATOS;
    }
  }

  private async deudores(): Promise<string> {
    if (!this.fuentes.ctacte) return "No tengo acceso a las cuentas corrientes en este momento.";
    try {
      const clientes = await this.fuentes.ctacte.listar(false);
      const deudores = clientes
        .filter((c) => Number(c.saldo) > 0)
        .sort((a, b) => Number(b.saldo) - Number(a.saldo));
      if (deudores.length === 0) return "Nadie te debe: todas las cuentas corrientes están al día. 👍";
      const total = deudores.reduce((a, c) => a + Number(c.saldo), 0);
      const filas = deudores.slice(0, 6).map((c) => `• ${c.nombre}: debe ${pesos(Number(c.saldo))}`).join("\n");
      return `Tenés ${pesos(total)} por cobrar de ${deudores.length} cliente(s):\n${filas}`;
    } catch {
      return NO_HAY_DATOS;
    }
  }

  private ayuda(): Promise<string> {
    return Promise.resolve(
      "Puedo ayudarte con datos de tu comercio. Probá preguntarme:\n" +
        "• ¿Cuánto vendí hoy?\n" +
        "• ¿Qué productos tengo por vencer?\n" +
        "• ¿Qué stock está bajo?\n" +
        "• ¿Quién me debe plata?",
    );
  }
}

/**
 * Adaptador HTTP real: le pregunta al servidor de sucursal (`POST
 * /asistente/preguntar`), que a su vez habla con Google Gemini (ADR-0011). La
 * API key de Gemini vive SOLO en ese servidor — nunca en el POS instalado.
 * Online (requiere conexión con el servidor); si falla, `AsistenteIACompuesto`
 * cae al mock.
 */
export class AsistenteIAHttp implements AsistenteIA {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async preguntar(texto: string): Promise<string> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/asistente/preguntar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ pregunta: texto }),
      });
    } catch (e) {
      throw new Error(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e));
    }
    if (!res.ok) {
      const cuerpo = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(cuerpo?.message ?? `El asistente respondió con error ${res.status}.`);
    }
    const data = (await res.json()) as { respuesta: string };
    return data.respuesta;
  }
}

/**
 * Asistente compuesto: las preguntas de **datos exactos del comercio** (ventas,
 * stock bajo, vencimientos, deudores) las responde siempre el mock local —son
 * rápidas, gratis y no pueden alucinar. Todo lo demás (explicar una función del
 * sistema, dudas fiscales, charla libre) se deriva al LLM real si está
 * disponible; si no hay conexión o no está configurado, cae al texto de ayuda.
 */
export class AsistenteIACompuesto implements AsistenteIA {
  constructor(
    private readonly datos: AsistenteIAMock,
    private readonly llm?: AsistenteIA,
  ) {}

  async preguntar(texto: string): Promise<string> {
    if (interpretar(texto) !== "ayuda" || !this.llm) {
      return this.datos.preguntar(texto);
    }
    try {
      return await this.llm.preguntar(texto);
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      const ayuda = await this.datos.preguntar(texto);
      return `${motivo}\n\n${ayuda}`;
    }
  }
}
