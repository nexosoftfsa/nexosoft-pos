# ADR-0039: Asistente IA con Google Gemini (server-side)

- **Estado:** Aceptada
- **Fecha:** 2026-07-06
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0011 (proveedor LLM Gemini), ADR-0019 (topología servidor de sucursal)

## Contexto

El Asistente IA (ver commit `feat(pos): pantallas Inicio...`) respondía solo
preguntas de **datos** del comercio (ventas, stock bajo, vencimientos,
deudores) con un mock por palabras clave. El usuario pidió que además
**entienda y explique el sistema** y tenga **noción del sistema fiscal
argentino** (ARCA, Monotributo, Ingresos Brutos/DGR) — "como tener un contador
adentro". Eso requiere un LLM real, no un matcheo de patrones.

## Decisión

1. **La integración con Gemini vive del lado del servidor** (`cloud-api`), NO en
   el POS instalado. Cada servidor de sucursal (ADR-0019: un servidor por
   comercio, en su LAN) tiene su **propia** `GEMINI_API_KEY` en su `.env`
   (nunca commiteada). Cuando se instale en un cliente, usa **su propia**
   cuenta de Google — no hay clave compartida entre comercios.
2. **Nuevo módulo `asistente`**: `POST /asistente/preguntar` (protegido por
   `JwtAuthGuard`, como el resto de la API) recibe `{ pregunta }`, arma el
   prompt de sistema (`prompt-sistema.ts`, contenido curado a mano) y llama a
   la API REST de Gemini (`generateContent`) directo por `fetch` — sin SDK, para
   no depender de un paquete npm cuyo nombre/versión pueda cambiar. Modelo
   configurable por `GEMINI_MODEL` (default `gemini-2.5-flash`; se probó
   `gemini-2.0-flash` y el proyecto de prueba tenía **cuota 0** en el free
   tier para ese modelo — si un cliente ve 429, cambiar el modelo es la primera
   pista).
3. **Prompt de sistema con dos bloques**: (a) qué es cada módulo de NexoSoft y
   cómo se usa (para que explique el sistema con precisión); (b) orientación
   general de ARCA/CAE, tipos de comprobante, condición de IVA, Monotributo,
   Ingresos Brutos/DGR — con la regla explícita de **nunca inventar un monto o
   categoría vigente** y siempre remitir a arca.gob.ar o a un contador para
   cifras puntuales (los importes cambian seguido; alucinar un número acá
   puede perjudicar al comercio).
4. **El POS combina dos fuentes** (`AsistenteIACompuesto`): las preguntas de
   **datos exactos** (ventas/stock/vencimientos/deudores) las sigue
   respondiendo el **mock local** — determinístico, gratis, no puede alucinar
   sobre el propio inventario. Todo lo demás (explicar una función, dudas
   fiscales, charla libre) se deriva al LLM real vía `AsistenteIAHttp` (nuevo
   adaptador HTTP al endpoint del punto 2). Si el LLM falla (sin conexión, sin
   `GEMINI_API_KEY` configurada, cuota agotada), cae al texto de ayuda del mock
   con el motivo del error.
5. **El "modo demo" (offline) sigue sin Gemini**: no tiene servidor, así que
   `AsistenteIACompuesto` se queda solo con el mock — coherente con la promesa
   de que el modo demo funciona sin conexión.

## Consecuencias

- La clave de API nunca viaja al instalador ni a la máquina del cliente final:
  vive únicamente en el servidor que cada comercio controla.
- El asistente responde con precisión sobre el propio negocio (sin alucinar
  números) y con criterio general en lo fiscal (sin comprometerse con cifras
  que cambian).
- Requiere conexión a internet del servidor de sucursal hacia Google para las
  preguntas no-de-datos; si no hay internet, el asistente sigue sirviendo para
  lo operativo (datos) y avisa que lo conversacional no está disponible.

## Alternativas consideradas

- **Poner la clave en el POS instalado** — descartada: quedaría expuesta en la
  máquina de cada cliente; contradice el modelo de "un servidor, una clave,
  bajo control del dueño de los datos" (ADR-0019/0020).
- **SDK oficial de Google (`@google/generative-ai` / `@google/genai`)** —
  descartado por ahora: la llamada REST directa con `fetch` es una sola función,
  sin depender de una versión de paquete específica; se puede migrar a SDK más
  adelante sin tocar el resto del sistema (el puerto `AsistenteIA` no cambia).
- **Function calling (que el LLM consulte el stock/ventas real)** — diferido:
  más complejo y con más superficie de error; el híbrido (mock para datos, LLM
  para todo lo demás) cubre el caso de uso con menos riesgo y sin costo extra
  en las preguntas de datos.
