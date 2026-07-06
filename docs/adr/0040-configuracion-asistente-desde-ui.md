# ADR-0040: Configurar la clave de Gemini desde la UI (sin tocar archivos)

- **Estado:** Aceptada
- **Fecha:** 2026-07-06
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0039 (asistente IA con Gemini, server-side)

## Contexto

En ADR-0039 la clave de Gemini se cargaba editando `apps/cloud-api/.env` a
mano. El usuario propuso "iniciar sesión con Google" para integrar Gemini
automáticamente. Se aclaró la limitación real: un login de Google (OAuth)
identifica a la persona, pero **no habilita por sí solo el acceso a la API de
Gemini** — eso requiere un proyecto de Google Cloud con la API habilitada
(que es justamente lo que la clave de API representa). Auto-provisionar ese
proyecto vía OAuth es un desarrollo grande (permisos de Resource
Manager/Service Usage, verificación de OAuth ante Google). Se acordó una
mejora intermedia: una **pantalla simple para pegar la clave**, sin tocar
archivos del servidor.

## Decisión

1. **Nueva tabla `ConfiguracionSistema`** en cloud-api (fila única, id fijo):
   `geminiApiKey`, `geminiModel`. Editable en caliente (no requiere reiniciar
   el servidor, a diferencia de `.env`).
2. **Prioridad: fila en base > variable de entorno.** Si el ADMIN carga una
   clave desde la UI, esa gana; si no cargó ninguna, se sigue usando
   `GEMINI_API_KEY`/`GEMINI_MODEL` del `.env` (retrocompatible con ADR-0039).
3. **Endpoints nuevos, restringidos a ADMIN** (`RolesGuard`): `GET
   /asistente/configuracion` (¿hay clave cargada? con qué modelo — **nunca
   devuelve la clave real**, solo un booleano) y `PUT /asistente/configuracion`
   (`{ apiKey, modelo? }`) para cargarla o reemplazarla.
4. **Pantalla en el POS**: desde "Asistente IA", el ADMIN ve un botón
   "⚙ Configurar IA" que abre un modal con el estado actual, un campo tipo
   password para pegar la clave (con el link a
   aistudio.google.com/apikey) y un campo opcional para el modelo. Solo
   visible cuando el POS está conectado a un servidor real (no en "modo
   demo" offline).

## Consecuencias

- El dueño del comercio carga su propia clave sin depender de que alguien le
  edite un archivo en el servidor — más accesible para un cliente no técnico.
- La clave se guarda en la base del servidor (no en el POS instalado),
  consistente con ADR-0039: cada servidor de sucursal tiene su propia clave.
- Sigue sin haber "un click y ya" con Google: el dueño igual tiene que generar
  la clave en AI Studio una vez. Eso es una limitación de la plataforma de
  Google, no de NexoSoft.

## Alternativas consideradas

- **Auto-provisión completa vía OAuth de Google Cloud** ("Sign in with
  Google" que crea el proyecto y habilita la API solo) — diferida: requiere
  scopes de administración de Cloud, verificación de OAuth ante Google, y
  probablemente igual un paso manual de facturación. Se evalúa a futuro si el
  volumen de clientes lo justifica.
- **Seguir editando `.env` a mano** — descartado: es fricción innecesaria para
  un dueño de comercio sin conocimientos técnicos.
