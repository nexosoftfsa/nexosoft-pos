import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PROMPT_SISTEMA } from './prompt-sistema';

// OJO: "gemini-2.0-flash" tenía cuota 0 en el free tier del proyecto de prueba
// (verificado 2026-07-06); "gemini-2.5-flash" respondió bien. Si en otro
// proyecto/cliente da 429, probar cambiando GEMINI_MODEL.
const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

interface RespuestaGemini {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
}

/**
 * Asistente IA respaldado por Google Gemini (ADR-0011). La clave de API vive
 * SOLO en este servidor (variable de entorno `GEMINI_API_KEY`), nunca viaja al
 * POS instalado. Cada servidor de sucursal usa su propia clave (la del
 * comercio dueño de ese servidor) — no hay clave compartida entre clientes.
 */
@Injectable()
export class AsistenteService {
  private readonly logger = new Logger(AsistenteService.name);

  constructor(private readonly config: ConfigService) {}

  async preguntar(pregunta: string): Promise<string> {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'El asistente de IA no está configurado en este servidor (falta GEMINI_API_KEY).',
      );
    }
    const modelo = this.config.get<string>('GEMINI_MODEL') ?? MODELO_POR_DEFECTO;
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
}
