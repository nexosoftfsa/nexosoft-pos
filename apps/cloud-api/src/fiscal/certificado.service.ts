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
  pareceDeHomologacion,
  type DatosCertificado,
} from './csr';
import type { EntornoArca } from './arca/wsaa';

export interface EstadoCertificado {
  readonly tieneClave: boolean;
  readonly tieneCertificado: boolean;
  readonly alias: string | null;
  readonly certificado: DatosCertificado | null;
  /** Días que faltan para el vencimiento. Negativo si ya venció. */
  readonly diasParaVencer: number | null;
  /** Carpeta donde vive todo, para poder respaldarla. */
  readonly carpeta: string;
  /** Entorno al que corresponde todo lo de arriba. */
  readonly entorno: EntornoArca;
  /**
   * `true` si hay certificado cargado para el OTRO entorno.
   *
   * Es lo que separa "todavía no hiciste el trámite" de "lo hiciste, pero para
   * el otro entorno". Sin distinguirlo, la pantalla manda a generar un pedido
   * nuevo — que regenera la clave y rompe el certificado que sí sirve.
   */
  readonly hayCertificadoDelOtroEntorno: boolean;
}

const OTRO: Record<EntornoArca, EntornoArca> = {
  produccion: 'homologacion',
  homologacion: 'produccion',
};

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

  /**
   * Dónde vive cada archivo.
   *
   * La clave, el pedido y el alias son del CUIT y NO del entorno: ARCA emite el
   * certificado de homologación y el de producción a partir del mismo CSR, así
   * que una sola clave sirve para los dos. El certificado sí es de cada uno —
   * los emite una autoridad distinta, y el de producción no vale en
   * homologación (ARCA contesta "Certificado no emitido por AC de confianza").
   *
   * El de producción se sigue llamando `certificado.crt`, sin sufijo, para no
   * tener que migrar nada: todo comercio ya instalado tiene ese archivo y es el
   * de producción. Renombrarlo obligaría a tocar carpetas que están fuera del
   * repo y que el comercio respalda a mano.
   */
  private comunes(cuit: string) {
    const carpeta = this.carpetaDe(cuit);
    return {
      carpeta,
      clave: join(carpeta, 'privada.key'),
      csr: join(carpeta, 'pedido.csr'),
      alias: join(carpeta, 'alias.txt'),
    };
  }

  private rutaCertificado(cuit: string, entorno: EntornoArca): string {
    return join(
      this.carpetaDe(cuit),
      entorno === 'produccion' ? 'certificado.crt' : 'certificado-homologacion.crt',
    );
  }

  private rutas(cuit: string, entorno: EntornoArca) {
    return { ...this.comunes(cuit), certificado: this.rutaCertificado(cuit, entorno) };
  }

  /** Carpeta raíz de los secretos, para que otros servicios ubiquen sus archivos. */
  get raizSecrets(): string {
    return this.raiz;
  }

  /**
   * El par certificado + clave, para firmarle a ARCA. `null` si falta alguno.
   *
   * Es lo único que expone la clave privada, y sólo dentro del servidor: nunca
   * sale por HTTP.
   */
  materialDeFirma(
    cuit: string,
    entorno: EntornoArca,
  ): { certificadoPem: string; clavePrivadaPem: string } | null {
    const r = this.rutas(cuit, entorno);
    if (!existsSync(r.clave) || !existsSync(r.certificado)) return null;
    return {
      certificadoPem: readFileSync(r.certificado, 'utf8'),
      clavePrivadaPem: readFileSync(r.clave, 'utf8'),
    };
  }

  estado(cuit: string, entorno: EntornoArca): EstadoCertificado {
    const r = this.rutas(cuit, entorno);
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
      entorno,
      hayCertificadoDelOtroEntorno: existsSync(this.rutaCertificado(cuit, OTRO[entorno])),
    };
  }

  /**
   * Genera la clave y el pedido. No pisa una clave existente salvo que se
   * pida explícitamente: regenerarla deja inservible el certificado que ARCA
   * ya haya emitido — los DOS, el de homologación y el de producción — y eso
   * corta la facturación del comercio.
   */
  generar(
    datos: { cuit: string; razonSocial: string; alias: string },
    forzar = false,
  ): CsrParaSubir {
    const r = this.comunes(datos.cuit);
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

  /**
   * Guarda el .crt que devolvió ARCA, después de verificar que sea el nuestro.
   *
   * Se guarda **para el entorno que el comercio tiene activo**, no encima del
   * otro. Antes había un solo archivo y cargar el de homologación pisaba el de
   * producción: al volver a producción el comercio quedaba sin poder facturar
   * y el error de ARCA no decía por qué.
   */
  guardarCertificado(
    cuit: string,
    certificadoPem: string,
    entorno: EntornoArca,
  ): DatosCertificado {
    const r = this.rutas(cuit, entorno);
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
    // Sólo se frena la dirección que se puede detectar sin adivinar: el emisor
    // de un certificado de prueba dice "homologación". Al revés no hay una
    // marca confiable, y un aviso falso acá haría dudar del archivo correcto.
    if (entorno === 'produccion' && pareceDeHomologacion(datos.emisor)) {
      throw new BadRequestException(
        'Ese certificado es de HOMOLOGACIÓN (así lo dice quien lo emitió) y el comercio está en producción. Con ese certificado ARCA rechaza todo. Sacá el de producción, o pasá primero el entorno a homologación si lo que querías era probar.',
      );
    }
    writeFileSync(r.certificado, certificadoPem, 'utf8');
    this.log.log(
      `Certificado de ARCA (${entorno}) guardado, vence el ${datos.validoHasta}`,
    );
    return datos;
  }
}
