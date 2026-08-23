import type { CSSProperties } from "react";
import type { EstadoLicencia } from "@nexosoft/licencias";

import { tonoDe } from "../datos/suscripcion";

/**
 * Avisos de suscripción en el POS (Fase 17.B, ADR-0056).
 *
 * Tres escalones, de suave a fuerte:
 * - **recordatorio**: una franja azul, discreta;
 * - **advertencia**: franja naranja, ya no se puede ignorar;
 * - **bloqueo**: pantalla completa sobre la venta.
 *
 * La pantalla de bloqueo **no tapa todo el sistema**: el comercio puede cerrar
 * la caja que quedó abierta y consultar o exportar lo suyo. Son sus registros
 * fiscales, no nuestros.
 */
export function BannerSuscripcion({ estado }: { estado: EstadoLicencia }) {
  const tono = tonoDe(estado);
  if (tono === null || tono === "bloqueo" || estado.aviso === null) return null;

  const colores =
    tono === "advertencia"
      ? { fondo: "#fffbeb", texto: "#92400e", borde: "#fde68a" }
      : { fondo: "#eff6ff", texto: "#1e40af", borde: "#bfdbfe" };

  return (
    <div
      role="status"
      style={{
        background: colores.fondo,
        color: colores.texto,
        borderBottom: `1px solid ${colores.borde}`,
        padding: "0.5rem 0.9rem",
        fontSize: "0.9rem",
        textAlign: "center",
      }}
    >
      {estado.aviso}
    </div>
  );
}

/**
 * Pantalla de bloqueo. Se muestra en lugar de la venta cuando la suscripción
 * está cortada; el resto del sistema sigue accesible por detrás.
 */
export function PantallaSuscripcionBloqueada({
  estado,
  onCerrarCaja,
}: {
  estado: EstadoLicencia;
  onCerrarCaja?: (() => void) | undefined;
}) {
  return (
    <div style={fondo}>
      <div style={tarjeta}>
        <div style={{ fontSize: "2.5rem" }}>🔒</div>
        <h1 style={titulo}>El sistema está bloqueado</h1>
        <p style={texto}>
          {estado.aviso ??
            "La suscripción está vencida. Comunicate con NexoSoft para reactivar el sistema."}
        </p>
        <div style={ayuda}>
          Podés seguir usando el resto del sistema: <b>cerrar la caja</b> que haya quedado abierta y{" "}
          <b>consultar o exportar</b> tus ventas, comprobantes y cuentas corrientes. Lo único que no
          está disponible es registrar operaciones nuevas.
        </div>
        {onCerrarCaja !== undefined && (
          <button type="button" style={boton} onClick={onCerrarCaja}>
            Ir a Caja para cerrar el turno
          </button>
        )}
        {estado.sinValidar && (
          <div style={{ ...ayuda, background: "#f8fafc", color: "#64748b" }}>
            Además, no se pudo confirmar el estado con NexoSoft desde hace un tiempo. Si ya pagaste,
            revisá que la PC tenga internet: el desbloqueo llega solo.
          </div>
        )}
      </div>
    </div>
  );
}

const fondo: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100%",
  padding: "2rem",
  background: "#f1f5f9",
};
const tarjeta: CSSProperties = {
  width: "min(560px, 92vw)",
  display: "flex",
  flexDirection: "column",
  gap: "0.9rem",
  padding: "2rem",
  background: "#fff",
  borderRadius: 14,
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
  textAlign: "center",
  alignItems: "center",
};
const titulo: CSSProperties = { fontSize: "1.5rem", fontWeight: 700, color: "#b91c1c", margin: 0 };
const texto: CSSProperties = { fontSize: "1.05rem", color: "#0f172a", margin: 0 };
const ayuda: CSSProperties = {
  background: "#f0fdf4",
  color: "#166534",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  fontSize: "0.9rem",
  textAlign: "left",
};
const boton: CSSProperties = {
  padding: "0.7rem 1.4rem",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
