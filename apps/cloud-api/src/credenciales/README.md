# Módulo `credenciales`

Credencial física de empleado con código de barras (Fase 15.A, ver
[ADR-0051](../../../../docs/adr/0051-credencial-de-empleado-con-codigo-de-barras.md)).
Permite loguearse en el POS escaneando una credencial impresa en vez de
tipear usuario/contraseña. **El barcode nunca codifica la contraseña real**:
codifica un token de acceso dedicado, revocable/regenerable de forma
independiente.

## Endpoints

Todos bajo `/api/v1/usuarios/:id/credencial`. Requieren `Authorization: Bearer
<token>` de un usuario **ADMIN** (ni siquiera autogestión: un ADMIN gestiona
la credencial de cualquier usuario de su sucursal, incluida la propia, pero
el gate de rol es el mismo para todos). Scopeados por la `sucursalId` del
token — un usuario de otra sucursal responde 404, igual que
`UsuariosController`.

| Método y ruta | Devuelve |
| -------------- | -------- |
| `GET /usuarios/:id/credencial` | `{ activa, version, creadaEn, ultimoUsoEn } \| null`. Sin body (200, no `"null"`) si el usuario nunca tuvo credencial. |
| `POST /usuarios/:id/credencial/regenerar` | `{ payload, version }`. El `payload` en claro **solo se devuelve esta vez** — no se puede volver a consultar. Invalida cualquier credencial anterior del usuario. |
| `DELETE /usuarios/:id/credencial` | `{ ok: true }`. Revoca la credencial (no la borra: queda el registro con `activa:false`). |

Login por credencial (endpoint separado, público — mismo criterio que
`POST /auth/login`): `POST /auth/login-credencial` con `{ credencial:
"<payload escaneado>" }`, devuelve el mismo par de tokens
(`accessToken`/`refreshToken`) que el login normal.

## Formato del payload

```
NXSCRED:{usuarioId}:{tokenPlano}
```

- Prefijo `NXSCRED:` — permite rechazar barato cualquier código escaneado que
  no sea una credencial (ej. si por error se escanea un producto en la
  pantalla de login), sin tocar la base.
- `usuarioId` (cuid) en claro: permite ubicar la credencial en **O(1)**
  (`findUnique` por `usuarioId`) sin comparar el token contra todos los
  hashes activos — `argon2.verify` es deliberadamente lento, no es viable
  iterarlo por cada intento.
- `tokenPlano`: `crypto.randomBytes(24).toString('base64url')` (~144 bits de
  entropía).
- Symbology del barcode: **Code128** (soporta el charset usado: alfanumérico,
  `-`, `_`, `:`).

Ver `credencial-payload.ts` (`armarPayload`/`parsearPayload`, funciones puras
sin DB).

## Seguridad

| Aspecto | Decisión |
| ------- | -------- |
| Storage del secreto | `argon2.hash(tokenPlano)` — nunca en claro, mismo criterio que `Usuario.passwordHash`. `validar()` solo devuelve el usuario si `argon2.verify` matchea. |
| Revocación por pérdida | `DELETE .../credencial`, solo ADMIN, inmediata. |
| Regeneración | Invalida la anterior automáticamente (mismo registro, `version` incrementa). |
| Expiración temporal automática | No implementada en 15.A (no pedida); evolución futura si se necesita. |
| RBAC | Solo ADMIN gestiona credenciales (generar/revocar/ver estado) de cualquier usuario. |
| Enumeración | `validar()` lanza siempre el mismo mensaje genérico (`"Credencial inválida"`) sin distinguir la causa (formato inválido, usuario inexistente, credencial revocada, hash que no matchea, usuario inactivo). |
| Auditoría | Cada intento (éxito/fallo) y cada regeneración/revocación queda en `RegistroAuditoria` (`LOGIN_CREDENCIAL`, `LOGIN_CREDENCIAL_FALLIDO`, `CREDENCIAL_REGENERADA`, `CREDENCIAL_REVOCADA`). |
| Rate-limiting de intentos | **No en 15.A** — aceptable porque `cloud-api` corre solo en la LAN del comercio (ADR-0019). Es un prerrequisito explícito de la Fase 15.B antes de exponer `admin-web`/el login a internet. |

## Diseño

`CredencialesService` no conoce HTTP: expone `obtenerEstado`, `regenerar`,
`revocar` y `validar` (usado por `AuthService.loginConCredencial`).
`AuthModule` importa `CredencialesModule` (dependencia unidireccional, sin
ciclo — `CredencialesService` solo depende de `PrismaService`).

En el POS (`apps/pos-desktop`), el escaneo se captura en `PantallaLogin.tsx`
reusando el hook `useLectorTeclado` ya existente (lectores HID se comportan
como teclado). Si el código escaneado empieza con `NXSCRED:`, dispara el
login por credencial; cualquier otro código se ignora. El formulario
usuario/contraseña sigue funcionando igual sin lector.

## Tests

`credencial-payload.spec.ts` cubre el roundtrip armar/parsear y el rechazo de
formatos inválidos. `credenciales.service.spec.ts` cubre regenerar (sube
versión, nunca persiste texto plano), revocar, y cada camino de `validar()`
(formato inválido, sin credencial, revocada, usuario inactivo, hash que no
matchea, éxito con `ultimoUsoEn` actualizado), verificando que cada rama
audita. `auth/auth.service.spec.ts` cubre `loginConCredencial` (éxito y
propagación del rechazo).

```bash
corepack pnpm --filter @nexosoft/cloud-api test
```
