# ADR-0051: Credencial de empleado con código de barras (token dedicado, no la contraseña)

- **Estado:** Aceptada
- **Fecha:** 2026-08-19
- **Decisores:** Equipo NexoSoft
- **Relacionada:** ADR-0009/0018 (puertos de hardware), ADR-0047 (registro cerrado)

## Contexto

Fase 15 pidió que cada usuario pudiera imprimir una credencial física
(tamaño estándar de credencial, 8×5cm) con foto, nombre y una contraseña en
formato código de barras, para loguearse en el POS escaneándola con el lector
de barras de la PC en vez de tipear usuario/contraseña.

Tomado literalmente ("la contraseña en código de barras"), esto es un riesgo
de seguridad real: un código de barras es trivial de fotografiar o
fotocopiar, y a diferencia de una tarjeta con chip no tiene ninguna protección
física. Si el barcode codificara la contraseña real del usuario, cualquiera
que consiga una foto de la credencial obtiene el mismo acceso permanente que
el empleado — incluyendo el acceso por contraseña normal desde cualquier
lugar, no solo el login por escaneo en esa PC.

El sistema ya tenía las piezas para resolver esto sin ese riesgo: un puerto
`LectorDeBarras` (`packages/hardware`, hoy solo lectura, sin implementación
real de hardware — ver ADR-0009/0018), un patrón de impresión de tamaño fijo
(`useImpresion` + `@page` con tamaño en mm, ya usado para ticket térmico y
factura A4), y un modelo de auth con JWT + `argon2` para contraseñas
(`apps/cloud-api/src/auth`). Pero no había ninguna librería de generación de
códigos de barra instalada, ni un mecanismo de auditoría implementado pese a
que CLAUDE.md la exige para operaciones sensibles.

## Decisión

El código de barras de la credencial **no codifica la contraseña real**.
Codifica un **token de acceso dedicado**: `NXSCRED:{usuarioId}:{tokenPlano}`,
generado con `crypto.randomBytes(24)`, persistido solo como hash (`argon2`,
tabla `CredencialAcceso`), y revocable/regenerable de forma completamente
independiente de la contraseña del usuario.

- **Regenerar** invalida automáticamente la credencial anterior (mismo
  registro, `version` incrementa) y devuelve el payload en claro **una sola
  vez** — el backend nunca lo vuelve a exponer, igual que una API key.
- **Revocar** (`DELETE /usuarios/:id/credencial`) desactiva la credencial de
  inmediato sin tocar la contraseña ni forzar un cambio de contraseña.
- **Login por credencial** (`POST /auth/login-credencial`) es un endpoint
  alternativo a `POST /auth/login`, no un segundo sistema de sesión: valida
  el payload contra el hash guardado y devuelve el mismo par de tokens JWT
  (access + refresh) que el login normal.
- Solo **ADMIN** puede generar, revocar o consultar el estado de la
  credencial de cualquier usuario — ni siquiera autogestión.
- Toda operación (login exitoso/fallido, regeneración, revocación) queda en
  una tabla `RegistroAuditoria` nueva — primera implementación real de lo que
  `docs/arquitectura.md` ya había diseñado y CLAUDE.md exige como
  no-negociable. Queda reusable para caja/precios/anulaciones en fases
  futuras, no solo para credenciales.
- Symbology **Code128** (soporta el charset del payload) vía **`jsbarcode`**
  (cliente, sin dependencias nativas, renderiza a SVG — no había ninguna
  librería de generación instalada hasta ahora).
- El escaneo se captura en `PantallaLogin.tsx` reusando el hook
  `useLectorTeclado` ya existente (lectores HID se comportan como teclado);
  esto obligó a sacar el `autoFocus` del input de usuario, porque el guard
  del hook ignora el teclado mientras el foco está en un `<input>`.

## Consecuencias

### Positivas
- Perder o fotografiar la credencial impresa no compromete la contraseña real
  del empleado ni su acceso fuera de esa PC.
- Revocar/regenerar una credencial comprometida es una operación de un clic,
  sin pedirle al empleado que cambie su contraseña.
- La auditoría de login por credencial queda gratis desde el día uno, y la
  tabla `RegistroAuditoria` cierra una deuda pendiente del diseño original
  para todo el sistema, no solo para esta feature.
- Reusa integramente la infraestructura existente (impresión de tamaño fijo,
  captura de lector como teclado, JWT/argon2) — no se agregó ningún
  mecanismo de sesión nuevo.

### Negativas / costos
- Un empleado que pierde la credencial física puede seguir logueándose con
  usuario/contraseña mientras un ADMIN no la revoque explícitamente: la
  revocación no es automática (no hay forma de saber "se perdió" sin que
  alguien lo reporte). Aceptado: mismo riesgo que perder cualquier llave
  física, y el ADMIN puede revocar en segundos apenas se entera.
- No hay expiración temporal automática de la credencial en esta fase — si
  se necesita en el futuro (ej. vencimiento a los N meses), es un cambio
  incremental sobre `CredencialAcceso` (agregar `expiraEn` y chequearlo en
  `validar()`).
- `POST /auth/login-credencial` sale sin rate-limiting propio, igual que
  `POST /auth/login` hoy — aceptable porque `cloud-api` corre solo en la LAN
  del comercio (ADR-0019). Queda como prerrequisito explícito de la Fase
  15.B antes de exponer el panel/login a internet.

## Alternativas consideradas

- **Codificar la contraseña real en el barcode** (pedido original, literal) —
  descartada por el riesgo de clonación descrito arriba: un secreto de largo
  plazo (la contraseña) no debería viajar impreso en un medio fácil de
  copiar sin ningún control de revocación independiente.
- **PIN corto en vez de token largo** — más cómodo de tipear a mano como
  fallback, pero mucho más débil contra fuerza bruta si alguien intenta
  adivinarlo sin escanear; se descartó porque el caso de uso es 100% escaneo
  (el PIN no aporta nada que el token no tenga, y sí resta entropía).
- **QR en vez de Code128** — un QR admite más datos y correción de errores,
  pero el payload es corto (menos de 80 caracteres) y los lectores de barras
  de escritorio típicos leen 1D (Code128/EAN), no QR; se eligió Code128 por
  compatibilidad con el hardware esperado en el comercio.
