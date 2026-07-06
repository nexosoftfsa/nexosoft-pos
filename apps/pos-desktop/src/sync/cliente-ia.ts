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

/** Puerto: lo que la pantalla del asistente necesita. */
export interface AsistenteIA {
  /** Responde una pregunta en lenguaje natural sobre el comercio. */
  preguntar(texto: string): Promise<string>;
}

/** Intención detectada en la pregunta del usuario (heurística simple). */
export type Intencion = "ventas" | "stock_bajo" | "vencimientos" | "deudores" | "ayuda";

const REGLAS: ReadonlyArray<{ intencion: Intencion; claves: readonly string[] }> = [
  { intencion: "vencimientos", claves: ["venc", "lote", "caduc", "por vencer"] },
  { intencion: "deudores", claves: ["deb", "deud", "cobrar", "fiado", "cuenta corriente", "me debe"] },
  { intencion: "stock_bajo", claves: ["stock", "repon", "falta", "reponer", "quedan", "bajo"] },
  { intencion: "ventas", claves: ["vend", "venta", "factur", "recaud", "hoy", "cuánto", "cuanto"] },
];

/** Clasifica la pregunta en una intención (pura, testeable sin datos). */
export function interpretar(texto: string): Intencion {
  const t = texto.toLowerCase();
  for (const r of REGLAS) {
    if (r.claves.some((c) => t.includes(c))) return r.intencion;
  }
  return "ayuda";
}

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

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
    const hoy = hoyIso();
    const r = await this.fuentes.reportes.resumen({ desde: hoy, hasta: hoy });
    if (r.cantidadVentas === 0) return "Todavía no hubo ventas hoy.";
    return `Hoy llevás ${r.cantidadVentas} venta(s) por ${pesos(Number(r.totalVendido))}, con un ticket promedio de ${pesos(Number(r.ticketPromedio))}.`;
  }

  private async vencimientos(): Promise<string> {
    if (!this.fuentes.stock) return "No tengo acceso al stock en este momento.";
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
  }

  private async stockBajo(): Promise<string> {
    if (!this.fuentes.stock) return "No tengo acceso al stock en este momento.";
    const saldos = await this.fuentes.stock.saldos();
    const bajos = saldos.filter((s) => Number(s.saldo) <= 5).sort((a, b) => Number(a.saldo) - Number(b.saldo));
    if (bajos.length === 0) return "El stock está en niveles razonables, no hay artículos por debajo del mínimo.";
    const filas = bajos.slice(0, 6).map((s) => `• ${s.producto.nombre}: quedan ${s.saldo}`).join("\n");
    return `Conviene reponer ${bajos.length} artículo(s):\n${filas}`;
  }

  private async deudores(): Promise<string> {
    if (!this.fuentes.ctacte) return "No tengo acceso a las cuentas corrientes en este momento.";
    const clientes = await this.fuentes.ctacte.listar(false);
    const deudores = clientes
      .filter((c) => Number(c.saldo) > 0)
      .sort((a, b) => Number(b.saldo) - Number(a.saldo));
    if (deudores.length === 0) return "Nadie te debe: todas las cuentas corrientes están al día. 👍";
    const total = deudores.reduce((a, c) => a + Number(c.saldo), 0);
    const filas = deudores.slice(0, 6).map((c) => `• ${c.nombre}: debe ${pesos(Number(c.saldo))}`).join("\n");
    return `Tenés ${pesos(total)} por cobrar de ${deudores.length} cliente(s):\n${filas}`;
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
 * Adaptador REAL con Google Gemini (ADR-0011). Pendiente: requiere `GEMINI_API_KEY`
 * y el SDK; además, para responder sobre el negocio se le pasarían los datos del
 * comercio como contexto (function calling / RAG sobre los mismos endpoints que
 * usa el mock). Se enchufa acá sin tocar la pantalla del asistente.
 */
export class AsistenteIAGemini implements AsistenteIA {
  preguntar(): Promise<string> {
    return Promise.reject(
      new Error("El asistente con Gemini todavía no está configurado (falta la API key)."),
    );
  }
}
