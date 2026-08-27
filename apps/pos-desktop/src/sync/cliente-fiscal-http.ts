/**
 * Cliente del certificado de ARCA (Fase 18). Solo ADMIN, contra el servidor de
 * sucursal: la clave privada vive ahí y no viaja nunca.
 */
import { esFalloDeRed, MENSAJE_SIN_CONEXION } from "./errores-red";

export interface DatosCertificado {
  readonly subject: string;
  readonly emisor: string;
  readonly validoDesde: string;
  readonly validoHasta: string;
  readonly cuit: string | null;
}

export interface EstadoCertificado {
  readonly tieneClave: boolean;
  readonly tieneCertificado: boolean;
  readonly alias: string | null;
  readonly certificado: DatosCertificado | null;
  readonly diasParaVencer: number | null;
  readonly carpeta: string;
}

export interface CsrGenerado {
  readonly csrPem: string;
  readonly subject: string;
  readonly archivo: string;
}

export class ErrorFiscalHttp extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErrorFiscalHttp";
  }
}

/** Los datos con los que el SERVIDOR le pide el CAE a ARCA. */
export interface DatosFiscalesDelComercio {
  readonly cuit: string;
  readonly razonSocial: string;
  readonly puntoDeVenta: number;
  readonly condicionIvaEmisor: string;
}

export type EntornoArca = "homologacion" | "produccion";

/** Lo que el servidor sabe de la identidad fiscal del comercio. */
export interface ConfiguracionFiscalServidor {
  readonly completa: boolean;
  readonly config: {
    readonly cuit: string;
    readonly razonSocial: string;
    readonly puntoDeVenta: number;
    readonly discriminaIva: boolean;
    readonly entorno: EntornoArca;
  } | null;
}

export interface ClienteCertificadoArca {
  estado(cuit: string): Promise<EstadoCertificado>;
  generarCsr(datos: {
    cuit: string;
    razonSocial: string;
    alias: string;
    forzar?: boolean;
  }): Promise<CsrGenerado>;
  subirCertificado(cuit: string, certificadoPem: string): Promise<DatosCertificado>;
  guardarDatosFiscales(datos: DatosFiscalesDelComercio): Promise<{ completa: boolean }>;
  configuracionFiscal(): Promise<ConfiguracionFiscalServidor>;
  cambiarEntorno(entorno: EntornoArca): Promise<ConfiguracionFiscalServidor>;
}

export class ClienteCertificadoArcaHttp implements ClienteCertificadoArca {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  estado(cuit: string): Promise<EstadoCertificado> {
    return this.pedir("GET", `/fiscal/certificado?cuit=${encodeURIComponent(cuit)}`);
  }

  generarCsr(datos: {
    cuit: string;
    razonSocial: string;
    alias: string;
    forzar?: boolean;
  }): Promise<CsrGenerado> {
    return this.pedir("POST", "/fiscal/certificado/csr", datos);
  }

  subirCertificado(cuit: string, certificadoPem: string): Promise<DatosCertificado> {
    return this.pedir("PUT", "/fiscal/certificado", { cuit, certificadoPem });
  }

  /**
   * Copia los datos fiscales al servidor.
   *
   * El POS los tiene para imprimir el ticket, pero el que habla con ARCA es el
   * servidor: sin esto, el comercio ve sus datos cargados en Configuración y el
   * servidor sigue sin poder facturar.
   */
  guardarDatosFiscales(datos: DatosFiscalesDelComercio): Promise<{ completa: boolean }> {
    return this.pedir("PUT", "/fiscal/configuracion", datos);
  }

  configuracionFiscal(): Promise<ConfiguracionFiscalServidor> {
    return this.pedir("GET", "/fiscal/configuracion");
  }

  /**
   * Cambia entre homologación (pruebas) y producción (comprobantes reales).
   *
   * Va aparte del resto de la configuración a propósito: pasar a producción es
   * empezar a emitir comprobantes de verdad, y no puede ser el efecto
   * colateral de guardar otra cosa.
   */
  cambiarEntorno(entorno: EntornoArca): Promise<ConfiguracionFiscalServidor> {
    return this.pedir("PUT", "/fiscal/configuracion", { arcaEntorno: entorno });
  }

  private async pedir<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
    const token = this.obtenerToken();
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${ruta}`, {
        method: metodo,
        headers: {
          ...(cuerpo !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token !== null ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
      });
    } catch (e) {
      throw new ErrorFiscalHttp(esFalloDeRed(e) ? MENSAJE_SIN_CONEXION : String(e), 0);
    }
    if (!res.ok) {
      const cuerpoError = (await res.json().catch(() => null)) as {
        message?: string | string[];
      } | null;
      const m = cuerpoError?.message;
      const mensaje = Array.isArray(m) ? m.join(". ") : (m ?? `Error ${res.status} del servidor`);
      throw new ErrorFiscalHttp(mensaje, res.status);
    }
    return (await res.json()) as T;
  }
}
