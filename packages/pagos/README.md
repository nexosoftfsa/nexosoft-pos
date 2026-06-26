# @nexosoft/pagos

Cobros electrónicos aislados detrás del puerto **`PasarelaDePago`**.
El POS no conoce la API de MercadoPago: solo habla con el contrato. Ver [ADR-0010](../../docs/adr/0010-pasarela-de-pago-mercadopago.md).

## Puerto `PasarelaDePago`

```ts
iniciarPago(solicitud: SolicitudPago): Promise<IntentoPago>
consultarEstado(intencionPagoId: string): Promise<IntentoPago>
cancelar(intencionPagoId: string): Promise<void>
```

Idempotencia garantizada por `intencionPagoId` (UUID generado por el POS).

## Implementaciones

| Clase | Uso |
|---|---|
| `MockPasarelaDePago` | Desarrollo y tests sin red ni credenciales |
| `MercadoPagoPoint` | Esqueleto — requiere SDK + credenciales reales |

## Mock

```ts
import { MockPasarelaDePago } from "@nexosoft/pagos";

const pasarela = new MockPasarelaDePago();
pasarela.resultadoSimulado = "aprobado"; // o "rechazado" o "timeout"

const intento = await pasarela.iniciarPago({ intencionPagoId: "uuid", monto, medio: "tarjeta_credito", descripcion: "Compra" });
const estado = await pasarela.consultarEstado(intento.intencionPagoId);
// estado.estado === "aprobado"
```

## Offline-first

Sin conexión la venta se cierra registrando la forma de pago con estado
`pendiente`. Al recuperar red se concilia contra MercadoPago.

## Tests

```bash
pnpm --filter @nexosoft/pagos test
```

## Estado para producción

`MercadoPagoPoint` lanza error hasta que se instale el SDK y se configuren las
credenciales (`accessToken`). Ver comentarios en `mercadopago-point.ts`.
