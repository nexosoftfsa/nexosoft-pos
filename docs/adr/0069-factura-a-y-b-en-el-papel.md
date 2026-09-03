# ADR-0069 — Factura A y B en el papel

Fecha: 2026-09-03
Estado: aceptado

## Contexto

Hasta acá el POS emitió **sólo Factura C** en producción: Sebastián es
Monotributo y es el único CUIT con el que se probó. Las letras A y B estaban
implementadas de punta a punta —resolución del tipo según emisor/receptor
(ADR-0012), validación del CUIT del receptor, `CondicionIVAReceptorId` de la
RG 5616, desglose real por alícuota desde el `tipoIva` de cada producto— pero
**nunca se emitió una**.

Al auditar qué faltaba apareció que el backend estaba completo y el hueco era
de **presentación**: el papel no muestra lo que ya se emite.

Una Factura A sin los datos del receptor impresos no cumple como comprobante,
por más que ARCA la haya autorizado.

## Decisión

### Qué se imprime, según la letra

| | Datos del receptor | IVA discriminado | Letra grande (A4) |
|---|---|---|---|
| **A** | siempre | sí | sí |
| **B** | sólo si hay cliente identificado | no | sí |
| **C** | nunca | no | no |

**La C no se toca.** Es la que está funcionando en producción y cualquier
cambio ahí es riesgo puro sin ganancia. La regla se aplicó como condición
explícita en los tres renderers, no como efecto colateral.

La B lleva los datos **sólo si el cajero eligió un cliente**, y es opcional a
propósito: la RG 5700/2025 elevó a **$10.000.000** el monto a partir del cual
identificar al consumidor final es obligatorio, así que la venta común de
mostrador no lo necesita. Ver "Lo que queda pendiente".

### ORIGINAL / DUPLICADO

- La impresión al confirmar la venta sale **ORIGINAL**.
- Toda reimpresión desde Comprobantes sale **DUPLICADO**.

Es la lectura simple de la exigencia formal: un mismo comprobante no puede
andar dando vueltas con varios papeles que parezcan cada uno el bueno. No se
lleva un contador de impresiones — la distinción es de **origen** (venta vs.
reimpresión), que es la que importa y no necesita estado nuevo.

Un `TicketNoFiscal` no lleva leyenda: no es un comprobante fiscal.

### Dónde vive la decisión

`letraFiscal()` y `llevaDatosDelReceptor()` son funciones puras en
`packages/hardware/src/impresora.ts`, con tests propios. Los tres renderers
—térmica ESC/POS, ticket HTML y A4— las consultan en vez de decidir cada uno
por su cuenta. Es la misma lección de ADR-0065: cuando la regla se repite en
tres lados, diverge.

`letraFiscal` deriva la letra del **último carácter** de `tipoComprobante`
("Factura A" → "A"). Es una heurística sobre el texto que se imprime, y se
eligió así porque `packages/hardware` no depende de `@nexosoft/domain` a
propósito (ADR-0018): los adaptadores son planos. Si alguna vez cambia
`etiquetaComprobante` en el dominio, hay que tocar acá — está anotado en el
código.

### Datos del receptor de punta a punta

El `Cliente` ya guardaba `documento`, `condicionIva` y `direccion`. Lo que
faltaba era transportarlos:

- El shell descartaba todo salvo `id` y `nombre` al armar la lista de clientes
  de la venta. Ahora pasa los datos fiscales.
- `historial()` y `obtener()` del servidor incluyen el cliente, para poder
  **reimprimir** una A con su receptor.
- Un cliente **sin documento** no arma bloque de receptor: no se puede
  identificar a alguien sin identificación, y media identificación en una A es
  peor que ninguna.

## Consecuencias

- Un comercio Responsable Inscripto puede emitir A y B con el papel completo.
- La C sigue exactamente igual. Los tests lo fijan explícitamente.
- Para **probar A/B hay que cambiar la condición del emisor a RI** en
  Configuración. En la PC de Sebastián eso no rompe nada: es banco de pruebas,
  no un comercio operando.
- **A/B no se pueden emitir en producción con el CUIT de Sebastián**: figura
  como Monotributo en el padrón y ARCA rechaza. La verificación de campo es en
  homologación hasta que haya un CUIT de RI.

## Lo que queda pendiente

- **El umbral de $10.000.000** (RG 5700/2025) no está implementado. Hoy el
  cajero puede emitir una B por cualquier monto sin identificar al comprador.
  Falta decidir si al superarlo se **bloquea** la venta o se **avisa**. Yo
  avisaría: bloquear una venta por un tema formal, con el cliente adelante, es
  peor que emitirla y corregirla.
- **Notas de Débito**: el dominio las tiene (`notaDebitoPara`), la UI no. Nadie
  puede emitir una todavía.
- **Percepciones** (IIBB, IVA, municipales): no implementadas.
