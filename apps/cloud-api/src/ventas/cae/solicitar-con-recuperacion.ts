import { ErrorWsfe, type DatosComprobante, type ResultadoAutorizacion } from '../../fiscal/arca/wsfev1';
import type { TicketAcceso } from '../../fiscal/arca/tra';

/** Lo único que se necesita de `ClienteWsfev1` para pedir el CAE y recuperarlo. */
export interface ClienteParaRecuperar {
  solicitarCae(ticket: TicketAcceso, datos: DatosComprobante): Promise<ResultadoAutorizacion>;
  consultarComprobante(
    ticket: TicketAcceso,
    puntoDeVenta: number,
    codigoComprobante: number,
    numero: number,
  ): Promise<ResultadoAutorizacion | null>;
}

/** Para dejar registro sin depender del Logger de Nest. */
export type Avisar = (mensaje: string) => void;

/**
 * Pide el CAE y, si la llamada se corta sin saber qué pasó, le pregunta a ARCA
 * si el comprobante quedó emitido igual.
 *
 * Es el agujero clásico de la facturación electrónica: ARCA otorga el CAE, la
 * respuesta se pierde en el camino (timeout, corte de red), y del lado nuestro
 * la venta queda PENDIENTE. El reintento pide el último número autorizado —que
 * ya incluye al comprobante emitido— y manda el SIGUIENTE. Resultado: un
 * comprobante vivo en ARCA que no figura en ningún lado acá, y una numeración
 * con un agujero que nadie ve hasta que lo encuentra el contador.
 *
 * Sólo se consulta ante un error **transitorio**. Si ARCA contestó y rechazó,
 * no hay nada que preguntar: contestó.
 */
export async function solicitarConRecuperacion(
  cliente: ClienteParaRecuperar,
  ticket: TicketAcceso,
  datos: DatosComprobante,
  avisar: Avisar = () => undefined,
): Promise<ResultadoAutorizacion> {
  try {
    return await cliente.solicitarCae(ticket, datos);
  } catch (e) {
    if (!(e instanceof ErrorWsfe) || !e.transitorio) throw e;

    const yaEmitido = await consultarSinFallar(cliente, ticket, datos, avisar);
    if (yaEmitido === null) throw e;

    avisar(
      `La respuesta de ARCA se perdió (${e.message}), pero el comprobante ` +
        `${datos.codigoComprobante}-${datos.puntoDeVenta}-${datos.numero} ya estaba autorizado. ` +
        'Se recupera el CAE en vez de emitir otro.',
    );
    return yaEmitido;
  }
}

/**
 * Consulta sin dejar que la consulta empeore las cosas.
 *
 * Si la consulta también falla se devuelve `null`, y la venta queda PENDIENTE:
 * el mismo estado que si no hubiéramos preguntado. Dejar que esta excepción se
 * propague cambiaría el error original por uno peor y menos informativo.
 */
async function consultarSinFallar(
  cliente: ClienteParaRecuperar,
  ticket: TicketAcceso,
  datos: DatosComprobante,
  avisar: Avisar,
): Promise<ResultadoAutorizacion | null> {
  try {
    return await cliente.consultarComprobante(
      ticket,
      datos.puntoDeVenta,
      datos.codigoComprobante,
      datos.numero,
    );
  } catch (e) {
    avisar(
      `No se pudo consultar si el comprobante había quedado emitido: ${(e as Error).message}`,
    );
    return null;
  }
}
