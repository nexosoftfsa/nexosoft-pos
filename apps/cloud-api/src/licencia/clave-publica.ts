/**
 * Clave pública que verifica las licencias de suscripción (ADR-0056).
 *
 * **No es un secreto.** Es la contraparte pública de la clave con la que
 * firma el Worker de `licencias.nexosoft.com.ar`; sirve para *verificar*, no
 * para emitir. Va acá, embebida, porque es la misma para todos los comercios:
 * si estuviera en el `.env` habría que cargarla a mano en cada instalación,
 * un paso manual más para equivocarse.
 *
 * Se puede pisar con `LICENCIAS_CLAVE_PUBLICA` (para pruebas, o el día que
 * haya que rotar la clave antes de que salga una versión nueva del servidor).
 *
 * Si algún día se rota el par de claves, cambiar esto obliga a publicar una
 * versión nueva del servidor y esperar a que todos los comercios actualicen.
 * Por eso la privada se cuida como se cuida: perderla es caro.
 */
export const CLAVE_PUBLICA_LICENCIAS =
  'MCowBQYDK2VwAyEAcHOAPZ8IDo4PLb6SXnmmfNsKSRafXavF7e4AsVcbxzA=';
