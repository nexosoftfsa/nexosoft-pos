# @nexosoft/licencias

Suscripción mensual: contrato de la licencia, estados y ventana de gracia.
Ver [ADR-0056](../../docs/adr/0056-suscripcion-mensual-y-panel-de-clientes.md).

**Puro a propósito**: tipos y reglas, sin criptografía ni red. Lo consumen
tanto el `cloud-api` como el POS, y el POS corre en un navegador donde
`node:crypto` no existe. La verificación de la firma Ed25519 vive en
`cloud-api`; el POS nunca verifica firmas, le pregunta a su servidor.

## Los tres escalones

| Estado | Puede vender | Qué ve el comercio |
| --- | --- | --- |
| `ACTIVA` | sí | nada |
| `RECORDATORIO` | sí | "tu próximo pago vence el 10/09/2026" |
| `ADVERTENCIA` | sí | "el pago venció; se va a bloquear en los próximos días" |
| `BLOQUEADA` | **no** | pantalla de bloqueo con el contacto de NexoSoft |

Estando `BLOQUEADA` el comercio **sí** puede cerrar la caja que quedó abierta
y ver o exportar lo histórico (`PERMITIDO_BLOQUEADA`): son sus registros
fiscales, no nuestros.

## La regla que manda

**Un corte de internet nunca bloquea a nadie.** Sólo bloquea un token firmado
que diga `BLOQUEADA`. Si el token vence sin poder renovarse, el sistema se
queda como mucho en advertencia:

```ts
evaluarLicencia(licenciaVencida, new Date());
// → { estado: "ADVERTENCIA", puedeVender: true, sinValidar: true, aviso: "No se pudo validar…" }
```

Bloquear por falta de contacto convertiría una caída de nuestro Worker, un DNS
vencido o el ISP del comercio en cajas paradas en todos lados a la vez.

## Uso

```ts
import { evaluarLicencia, MockProveedorLicencias } from "@nexosoft/licencias";

const proveedor = new MockProveedorLicencias(); // en producción, LicenciasHttp
const licencia = await proveedor.obtener("lagus"); // null si no hay red
const estado = evaluarLicencia(licencia);

if (!estado.puedeVender) mostrarPantallaDeBloqueo(estado.aviso);
```

```bash
corepack pnpm --filter @nexosoft/licencias test
```
