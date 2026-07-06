import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PROMPT_SISTEMA } from './prompt-sistema';

// OJO: "gemini-2.0-flash" tenía cuota 0 en el free tier del proyecto de prueba
// (verificado 2026-07-06); "gemini-2.5-flash" respondió bien. Si en otro
// proyecto/cliente da 429, probar cambiando el modelo desde la config.
const MODELO_POR_DEFECTO = 'gemini-2.5-flash';
/** Id fijo de la única fila de configuración (ADR-0040). */
const ID_CONFIG = 1;

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

export interface EstadoConfiguracionAsistente {
  readonly configurada: boolean;
  readonly modelo: string;
}

/**
 * Asistente IA respaldado por Google Gemini (ADR-0011). La clave de API se
 * carga desde la UI (ADR-0040, `ConfiguracionSistema` en la base) o, si no hay
 * ninguna cargada, desde la variable de entorno `GEMINI_API_KEY` (compatible
 * con instalaciones previas). En cualquier caso, vive SOLO en este servidor —
 * nunca viaja al POS instalado. Cada servidor de sucursal tiene su propia
 * clave (la del comercio dueño de ese servidor).
 */
@Injectable()
export class AsistenteService {
  private readonly logger = new Logger(AsistenteService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async preguntar(pregunta: string): Promise<string> {
    const { apiKey, modelo } = await this.resolverCredenciales();
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El asistente de IA todavía no está configurado en este servidor. Cargá la clave desde Configuración.',
      );
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT_SISTEMA }] },
          contents: [{ role: 'user', parts: [{ text: pregunta }] }],
        }),
      });
    } catch (error) {
      this.logger.error(`No se pudo contactar a Gemini: ${(error as Error).message}`);
      throw new ServiceUnavailableException('No se pudo conectar con el asistente de IA (sin internet?).');
    }

    const data = (await res.json().catch(() => ({}))) as RespuestaGemini;
    if (!res.ok) {
      this.logger.error(`Gemini respondió ${res.status}: ${data.error?.message ?? ''}`);
      throw new ServiceUnavailableException('El asistente de IA no pudo responder en este momento.');
    }

    const texto = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texto) {
      throw new ServiceUnavailableException('El asistente de IA no devolvió una respuesta.');
    }
    return texto.trim();
  }

  /** Estado para la pantalla de configuración: si hay clave cargada, y con qué modelo. Nunca devuelve la clave. */
  async obtenerConfiguracion(): Promise<EstadoConfiguracionAsistente> {
    const { apiKey, modelo } = await this.resolverCredenciales();
    return { configurada: Boolean(apiKey), modelo };
  }

  /** Guarda (o reemplaza) la clave desde la UI. `modelo` es opcional (usa el default si no se manda). */
  async actualizarConfiguracion(apiKey: string, modelo?: string): Promise<EstadoConfiguracionAsistente> {
    const fila = await this.prisma.configuracionSistema.upsert({
      where: { id: ID_CONFIG },
      create: { id: ID_CONFIG, geminiApiKey: apiKey, geminiModel: modelo ?? null },
      update: { geminiApiKey: apiKey, geminiModel: modelo ?? null },
    });
    return { configurada: true, modelo: fila.geminiModel ?? MODELO_POR_DEFECTO };
  }

  /** La fila en base (si existe) tiene prioridad sobre la variable de entorno. */
  private async resolverCredenciales(): Promise<{ apiKey: string | undefined; modelo: string }> {
    const fila = await this.prisma.configuracionSistema.findUnique({ where: { id: ID_CONFIG } });
    const apiKey = fila?.geminiApiKey ?? this.config.get<string>('GEMINI_API_KEY');
    const modelo = fila?.geminiModel ?? this.config.get<string>('GEMINI_MODEL') ?? MODELO_POR_DEFECTO;
    return { apiKey: apiKey ?? undefined, modelo };
  }
}
