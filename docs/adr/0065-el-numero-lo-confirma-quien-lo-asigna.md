# ADR-0065 — El número lo confirma quien lo asigna, y el arqueo dice contra qué se firmó

Fecha: 2026-09-02
Estado: aceptado

## Contexto

Dos cabos sueltos que quedaron de la prueba sin internet (ADR-0064), los dos
detectados al explicarle el sistema a Rodrigo.

### 1. El ticket interno tenía el mismo problema que el fiscal

ADR-0064 arregló el número **fiscal**: sin CAE no se imprime un número que
después va a cambiar. Pero un `TicketNoFiscal` quedó afuera, y tiene el mismo
defecto por otra razón:

- La terminal numera con un correlativo local por `(punto de venta, tipo)`.
- El servidor numera con `siguienteNumeroNoFiscal`, que es `MAX + 1` por
  **`(sucursal, tipo)`** — una sola serie para todas las cajas.

Con una sola caja los dos contadores van parejos y no se nota. Con dos cajas
divergen desde la primera venta, y basta una venta rechazada por el servidor
para desfasarlos también con una sola caja. El papel decía un número y
Comprobantes otro.

### 2. El arqueo de caja cerrado durante un corte

El saldo teórico del turno se deriva de las ventas EFECTIVO **que están en el
servidor** (ADR-0026). Durante un corte, el efectivo de las ventas sin subir
está en el cajón pero no en la base:

```
Fondo 10.000 + ventas subidas 50.000        = teórico  60.000
Ventas hechas sin internet                  =          30.000
Plata real en el cajón                      =          90.000
Arqueo: 90.000 − 60.000 = +30.000 de SOBRANTE que no existe
```

Y después empeora: `calcularResumen` recalcula el teórico en cada lectura, así
que al sincronizar pasa a decir 90.000 — pero `montoContado` y `diferencia` se
guardaron al cerrar y no se tocan. El turno queda mostrando **contado 90.000,
teórico 90.000, diferencia +30.000**: tres números que no cierran entre sí.

## Decisión

### El número es definitivo cuando lo confirmó quien lo asigna

Una sola regla, `numeroEsProvisional()`, para los tres formatos:

| Comprobante | Lo numera | La prueba de que lo hizo |
|---|---|---|
| Fiscal | ARCA | el CAE |
| Ticket interno | el servidor de sucursal | `numeroConfirmado` |

Mientras no esté confirmado se imprime `Referencia interna NNNNNNNN` y una
leyenda que dice quién asigna el definitivo — distinta según el caso, porque un
ticket interno no espera ninguna autorización de ARCA y decirle eso sería
mentira.

Para que el caso normal no se degrade, **el ticket interno también espera al
servidor**, pero 1,5s en vez de los 5s del fiscal: no toca ARCA, sólo pide un
número a la LAN y contesta en milisegundos. Sin red no espera nada
(`encolarYEsperarComprobante` corta solo si está offline), así que la promesa
del ADR-0061 —el ticket interno sale al instante— se mantiene.

Se descartó **numerar por terminal** para que el correlativo local fuera el
definitivo: obligaría a meter `terminalId` en el `@@unique` de numeración, y ese
índice es también lo que protege la numeración **fiscal**, que es por punto de
venta. No se toca.

### El arqueo guarda contra qué se firmó

`TurnoCaja` gana `ventasSinSincronizarAlCerrar`, que manda el POS (es el largo
de su cola; el servidor no puede saberlo). Con eso el resumen expone:

- `diferencia` — **la que se firmó, intacta**;
- `diferenciaRecalculada` — la misma cuenta con lo que hay ahora;
- `arqueoIncompleto` — si las dos difieren y había pendientes al cerrar.

Y el POS **avisa antes del arqueo** si hay ventas sin subir, sin bloquear el
cierre: a veces el turno se termina igual.

Se descartó **recalcular la diferencia por atrás**. Es un registro de auditoría
de caja (CLAUDE.md §5): un supervisor que vio +$30.000 y mañana ve $0 sin
explicación tiene razón en desconfiar del sistema. Se muestran las dos y se
explica por qué difieren.

## Consecuencias

- Un ticket interno impreso sin conexión sale con referencia interna; con
  conexión, con su número del servidor, igual que siempre.
- Un turno cerrado durante un corte deja de mostrar números contradictorios y
  explica que el faltante/sobrante no fue del cajero.
- Los turnos cerrados **antes** de este cambio tienen la columna en `null`, así
  que no se marcan como incompletos: no hay forma de saber a posteriori cuántas
  ventas faltaban.
- La migración es aditiva y nullable: una versión anterior del servidor sigue
  funcionando contra esta base.
