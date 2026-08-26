import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizarCuit } from '@nexosoft/domain';

import {
  ErrorCsr,
  generarCsr,
  leerCertificado,
  normalizarAlias,
  type DatosCertificado,
} from './csr';

export interface EstadoCertificado {
  readonly tieneClave: boolean;
  readonly tieneCertificado: boolean;
  readonly alias: string | null;
  readonly certificado: DatosCertificado | null;
  /** Días que faltan para el vencimiento. Negativo si ya venció. */
  readonly diasParaVencer: number | null;
  /** Carpeta donde vive todo, para poder respaldarla. */
  readonly carpeta: string;
}

export interface CsrParaSubir {
  readonly csrPem: string;
  readonly subject: string;
  readonly archivo: string;
}

/**
 * Guarda y administra el certificado de ARCA de ESTE comercio.
 *
 * Los archivos van fuera del programa, junto a los datos (ADR-0008: los
 * certificados no viven en el repo ni en la carpeta de instalación). Eso además
 * los salva del desinstalador, que borra C:\NexoSoft-Servidor — la misma
 * lección que nos costó medio día con el .env.
 *
 * La clave privada NUNCA sale de acá: no se devuelve por HTTP, ni siquiera al
 * ADMIN. Si se pierde, hay que pedirle a ARCA un certificado nuevo.
 */
@Injectable()
export class CertificadoService {
  private readonly log = new Logger(CertificadoService.name);

  constructor(private readonly config: ConfigService) {}

  private get raiz(): string {
    return (
      this.config.get<string>('FISCAL_SECRETS_DIR') ?? join('C:', 'ProgramData', 'NexoSoft', 'secrets')
    );
  }

  private carpetaDe(cuit: string): string {
    return join(this.raiz, 'arca', normalizarCuit(cuit));
  }

  private rutas(cuit: string) {
    const carpeta = this.carpetaDe(cuit);
    return {
      carpeta,
      clave: join(carpeta, 'privada.key'),
      csr: join(carpeta, 'pedido.csr'),
      certificado: join(carpeta, 'certificado.crt'),
      alias: join(carpeta, 'alias.txt'),
    };
  }

  estado(cuit: string): EstadoCertificado {
    const r = this.rutas(cuit);
    const tieneClave = existsSync(r.clave);
    const tieneCertificado = existsSync(r.certificado);
    let certificado: DatosCertificado | null = null;
    if (tieneClave && tieneCertificado) {
      try {
        certificado = leerCertificado(
          readFileSync(r.certificado, 'utf8'),
          readFileSync(r.clave, 'utf8'),
        );
      } catch (e) {
        // Un certificado ilegible no puede tumbar la pantalla de configuración:
        // se informa como "no hay" y el ADMIN puede volver a subirlo.
        this.log.warn(`El certificado guardado no se pudo leer: ${(e as Error).message}`);
      }
    }
    const diasParaVencer =
      certificado === null
        ? null
        : Math.floor(
            (new Date(certificado.validoHasta).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
          );
    return {
      tieneClave,
      tieneCertificado: certificado !== null,
      alias: existsSync(r.alias) ? readFileSync(r.alias, 'utf8').trim() : null,
      certificado,
      diasParaVencer,
      carpeta: r.carpeta,
    };
  }

  /**
   * Genera la clave y el pedido. No pisa una clave existente salvo que se
   * pida explícitamente: regenerarla deja inservible el certificado que ARCA
   * ya haya emitido, y eso corta la facturación del comercio.
   */
  generar(
    datos: { cuit: string; razonSocial: string; alias: string },
    forzar = false,
  ): CsrParaSubir {
    const r = this.rutas(datos.cuit);
    if (existsSync(r.clave) && !forzar) {
      throw new ConflictException(
        'Este comercio ya tiene una clave generada. Si pedís una nueva, el certificado que ARCA haya emitido para la anterior deja de servir y hay que hacer el trámite otra vez.',
      );
    }

    let generado;
    try {
      generado = generarCsr(datos);
    } catch (e) {
      if (e instanceof ErrorCsr) throw new BadRequestException(e.message);
      throw e;
    }

    mkdirSync(r.carpeta, { recursive: true });
    writeFileSync(r.clave, generado.clavePrivadaPem, { encoding: 'utf8', mode: 0o600 });
    writeFileSync(r.csr, generado.csrPem, 'utf8');
    writeFileSync(r.alias, normalizarAlias(datos.alias), 'utf8');
    this.log.log(`Pedido de certificado generado para el CUIT ${normalizarCuit(datos.cuit)}`);

    return { csrPem: generado.csrPem, subject: generado.subject, archivo: r.csr };
  }

  /** Guarda el .crt que devolvió ARCA, después de verificar que sea el nuestro. */
  guardarCertificado(cuit: string, certificadoPem: string): DatosCertificado {
    const r = this.rutas(cuit);
    if (!existsSync(r.clave)) {
      throw new BadRequestException(
        'Todavía no se generó el pedido de certificado en esta PC. Generalo primero y con ESE pedido sacá el certificado en ARCA.',
      );
    }
    let datos: DatosCertificado;
    try {
      datos = leerCertificado(certificadoPem, readFileSync(r.clave, 'utf8'));
    } catch (e) {
      if (e instanceof ErrorCsr) throw new BadRequestException(e.message);
      throw e;
    }
    if (datos.cuit !== null && datos.cuit !== normalizarCuit(cuit)) {
      throw new BadRequestException(
        `Ese certificado es del CUIT ${datos.cuit} y este comercio es ${normalizarCuit(cuit)}.`,
      );
    }
    writeFileSync(r.certificado, certificadoPem, 'utf8');
    this.log.log(`Certificado de ARCA guardado, vence el ${datos.validoHasta}`);
    return datos;
  }
}
