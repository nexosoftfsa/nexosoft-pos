import { Agent, request as pedirHttps } from 'node:https';
import { URL } from 'node:url';

/**
 * Cliente HTTP para ARCA, con el cifrado que su servidor de producción exige.
 *
 * ## Por qué no se usa `fetch`
 *
 * `servicios1.afip.gov.ar` (producción) negocia Diffie-Hellman con una clave de
 * 1024 bits. El OpenSSL de Node la rechaza por política de seguridad y la
 * conexión ni siquiera se abre:
 *
 *     ERR_SSL_DH_KEY_TOO_SMALL
 *     error:0A00018A:SSL routines:tls_process_ske_dhe:dh key too small
 *
 * En el navegador abre igual, y eso despista: Chrome ya no ofrece la familia
 * DHE, así que negocia ECDHE y esquiva el problema sin enterarse. Homologación
 * tampoco fallaba, así que el sistema anduvo meses y se rompió recién al pasar
 * a producción.
 *
 * ## Qué se hace
 *
 * Se pide **sólo ECDHE**. El servidor de ARCA lo soporta —es lo que usa
 * cualquier navegador— y así el problema desaparece **sin bajar la seguridad**:
 *
 * | Alternativa | Resultado |
 * |---|---|
 * | Sin tocar nada | falla |
 * | `@SECLEVEL=1` | anda, pero usa la clave DH débil |
 * | `DEFAULT:!DHE` | anda, pero cae en RSA plano: **sin forward secrecy** |
 * | **`ECDHE`** | anda con `ECDHE-RSA-AES256-GCM-SHA384` |
 *
 * Verificado contra los cuatro endpoints (WSAA y WSFEv1, producción y
 * homologación): los cuatro negocian ECDHE.
 *
 * El agente reutiliza la conexión, así que las dos llamadas de una venta
 * (`FECompUltimoAutorizado` y `FECAESolicitar`) comparten el handshake TLS en
 * vez de hacer uno cada una.
 */

/** Sólo intercambio de claves efímero por curva elíptica: rápido y con forward secrecy. */
const CIFRADOS = 'ECDHE';

const agente = new Agent({
  ciphers: CIFRADOS,
  keepAlive: true,
  // Alcanza y sobra para un comercio: son dos llamadas por venta.
  maxSockets: 8,
});

/** Lo que usamos de una respuesta HTTP. */
export interface RespuestaHttp {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

export interface PedidoHttp {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly signal?: AbortSignal;
}

/**
 * La forma de `fetch` que necesitan los clientes de ARCA. Se declara acá para
 * poder inyectar un doble en los tests sin arrastrar todo el tipo de `fetch`.
 */
export type FetchLike = (url: string, init?: PedidoHttp) => Promise<RespuestaHttp>;

export const fetchArca: FetchLike = (url, init = {}) =>
  new Promise<RespuestaHttp>((resolver, rechazar) => {
    const destino = new URL(url);
    const { signal } = init;

    if (signal?.aborted === true) {
      rechazar(signal.reason);
      return;
    }

    const pedido = pedirHttps(
      {
        agent: agente,
        hostname: destino.hostname,
        port: destino.port === '' ? 443 : Number(destino.port),
        path: `${destino.pathname}${destino.search}`,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
      },
      (respuesta) => {
        const trozos: Buffer[] = [];
        respuesta.on('data', (t: Buffer) => trozos.push(t));
        respuesta.on('end', () => {
          const estado = respuesta.statusCode ?? 0;
          const cuerpo = Buffer.concat(trozos).toString('utf8');
          resolver({
            ok: estado >= 200 && estado < 300,
            status: estado,
            text: () => Promise.resolve(cuerpo),
          });
        });
        respuesta.on('error', rechazar);
      },
    );

    // Se aborta con el mismo motivo que traiga la señal: así el que llama
    // puede distinguir un corte por tiempo de un fallo de red.
    const alAbortar = () => pedido.destroy(signal?.reason as Error);
    signal?.addEventListener('abort', alAbortar, { once: true });

    pedido.on('error', (e) => {
      signal?.removeEventListener('abort', alAbortar);
      rechazar(e);
    });
    pedido.on('close', () => signal?.removeEventListener('abort', alAbortar));

    if (init.body !== undefined) pedido.write(init.body);
    pedido.end();
  });
