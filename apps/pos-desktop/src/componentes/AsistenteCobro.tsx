/**
 * Modal de cobro por teclado (Fase 16): "Seleccionar Medio" → flechas +
 * Enter, inspirado en el simulador de Gemini (`NexoSoft_Simulador_Cobro.html`).
 * Componente puramente presentacional — no tiene `onKeyDown` propio ni
 * lógica de negocio: la navegación (flechas/Enter/Escape) vive en el
 * listener global de teclado de `PantallaPos.tsx`, que es quien decide qué
 * paso sigue y arma los pagos reusando `agregarPago`/`armarPagoUi` ya
 * existentes. Acá solo se resalta el `cursor`-ésimo ítem de la lista activa
 * y se pinta el resumen de pagos + "Falta pagar".
 */
import type { RefObject } from "react";

import type { FormaDePago, Money } from "@nexosoft/domain";

import { pesos } from "../formato";
import type { ClienteVenta, PagoUi } from "./PantallaPos";
import type { Tarjeta, TasaCuota } from "../sync/cliente-medios-pago";
import type { PasoAsistente } from "./asistente-cobro-helpers";

function etiquetaTarjeta(t: Tarjeta): string {
  return `${t.banco}${t.marca ? ` — ${t.marca}` : ""} (${t.tipo === "CREDITO" ? "Crédito" : "Débito"})`;
}

export function AsistenteCobro({
  paso,
  cursor,
  formas,
  formaPago,
  tarjetas,
  tarjetaActual,
  tasaActual,
  clientes,
  montoPago,
  onCambiarMonto,
  montoInputRef,
  recargoVivo,
  montoBaseVivo,
  saldoPendiente,
  pagos,
  onQuitarPago,
  error,
}: {
  paso: Exclude<PasoAsistente, "cerrado">;
  cursor: number;
  formas: ReadonlyArray<{ valor: FormaDePago; etiqueta: string; electronico?: boolean }>;
  formaPago: FormaDePago;
  tarjetas: readonly Tarjeta[];
  tarjetaActual: Tarjeta | undefined;
  tasaActual: TasaCuota | undefined;
  clientes: readonly ClienteVenta[];
  montoPago: string;
  onCambiarMonto: (valor: string) => void;
  montoInputRef: RefObject<HTMLInputElement>;
  recargoVivo: Money | null;
  montoBaseVivo: Money | null;
  saldoPendiente: Money;
  pagos: readonly PagoUi[];
  onQuitarPago: (indice: number) => void;
  error: string | null;
}) {
  const etiquetaFormaActual = formas.find((f) => f.valor === formaPago)?.etiqueta ?? formaPago;

  return (
    <div className="overlay">
      <div className="asistente-cobro">
        <div className="asistente-header">
          <h2>{tituloDePaso(paso)}</h2>
          <div className="asistente-balance">{pesos(saldoPendiente)}</div>
        </div>
        <div className="asistente-body">
          <div className="asistente-col-main">
            {paso === "medio" && (
              <ul className="asistente-lista">
                {formas.map((f, i) => (
                  <li key={f.valor} className={i === cursor ? "asistente-item seleccionado" : "asistente-item"}>
                    {f.etiqueta}
                  </li>
                ))}
              </ul>
            )}

            {paso === "tarjeta" && (
              <ul className="asistente-lista">
                {tarjetas.map((t, i) => (
                  <li key={t.id} className={i === cursor ? "asistente-item seleccionado" : "asistente-item"}>
                    {etiquetaTarjeta(t)}
                  </li>
                ))}
              </ul>
            )}

            {paso === "cuotas" && tarjetaActual && (
              <ul className="asistente-lista">
                {tarjetaActual.tasas.map((t, i) => (
                  <li
                    key={t.cantidadCuotas}
                    className={i === cursor ? "asistente-item seleccionado" : "asistente-item"}
                  >
                    {t.cantidadCuotas} cuota{t.cantidadCuotas === 1 ? "" : "s"} — {t.recargoPorcentaje}%
                  </li>
                ))}
              </ul>
            )}

            {paso === "cliente" && (
              <ul className="asistente-lista">
                {clientes.map((c, i) => (
                  <li key={c.id} className={i === cursor ? "asistente-item seleccionado" : "asistente-item"}>
                    {c.nombre}
                  </li>
                ))}
              </ul>
            )}

            {paso === "monto" && (
              <div className="asistente-monto-contenedor">
                <div className="asistente-monto-label">
                  Monto a abonar con <strong>{etiquetaFormaActual}</strong>
                  {tarjetaActual && ` — ${tarjetaActual.banco}`}
                  {tasaActual && ` (${tasaActual.cantidadCuotas} cuota${tasaActual.cantidadCuotas === 1 ? "" : "s"})`}
                </div>
                <input
                  ref={montoInputRef}
                  type="text"
                  inputMode="decimal"
                  className="asistente-monto"
                  value={montoPago}
                  onChange={(e) => onCambiarMonto(e.target.value)}
                />
                {recargoVivo && montoBaseVivo && (
                  <span className="muted">
                    + {pesos(recargoVivo)} recargo = {pesos(montoBaseVivo.sumar(recargoVivo))}
                  </span>
                )}
                {error && <div className="error">{error}</div>}
              </div>
            )}
          </div>

          <div className="asistente-col-resumen">
            <div className="asistente-resumen-titulo">Resumen de pagos</div>
            <div className="asistente-resumen-lista">
              {pagos.length === 0 && <div className="asistente-resumen-vacio">Sin pagos todavía…</div>}
              {pagos.map((p, i) => {
                const tarjeta = tarjetas.find((t) => t.id === p.tarjetaConfigId);
                const base = formas.find((f) => f.valor === p.forma)?.etiqueta ?? p.forma;
                const etiqueta =
                  tarjeta !== undefined
                    ? `${base} — ${tarjeta.banco} (${p.cuotas} cuota${p.cuotas === 1 ? "" : "s"})`
                    : base;
                return (
                  <div key={i} className="asistente-resumen-item">
                    <span>{etiqueta}</span>
                    <span>{pesos(p.monto)}</span>
                    <button onClick={() => onQuitarPago(i)} aria-label="Quitar pago">
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="asistente-resumen-item asistente-resumen-total">
              <span>Falta pagar:</span>
              <span>{pesos(saldoPendiente)}</span>
            </div>
          </div>
        </div>
        <div className="asistente-footer">{pieDeAyuda(paso)}</div>
      </div>
    </div>
  );
}

function tituloDePaso(paso: Exclude<PasoAsistente, "cerrado">): string {
  switch (paso) {
    case "medio":
      return "Seleccionar Medio";
    case "tarjeta":
      return "Elegir Tarjeta";
    case "cuotas":
      return "Elegir Cuotas";
    case "cliente":
      return "Elegir Cliente";
    case "monto":
      return "Confirmar Monto";
  }
}

function pieDeAyuda(paso: Exclude<PasoAsistente, "cerrado">): string {
  if (paso === "monto") return "Modificá el monto (pago mixto) y presioná Enter. Esc cancela.";
  return "Usá ↑ ↓ para elegir y Enter para confirmar. Esc cancela.";
}
