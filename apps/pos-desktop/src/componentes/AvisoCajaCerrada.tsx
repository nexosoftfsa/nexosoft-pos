import type { CSSProperties } from "react";

/**
 * Pantalla que reemplaza a la venta cuando no hay un turno de caja abierto
 * (Fase 17.F).
 *
 * Vender sin caja abierta deja plata sin respaldo: el arqueo del cierre no
 * cuadra contra nada y no hay forma de saber a qué turno pertenece cada venta.
 * Los movimientos de efectivo ya eran imposibles sin turno (cuelgan de un
 * `turnoId`); lo que faltaba era cerrar la puerta de la venta.
 *
 * No bloquea el resto del sistema: solo la pantalla de venta.
 */
export function PantallaCajaCerrada({ onAbrirCaja }: { onAbrirCaja?: (() => void) | undefined }) {
  return (
    <div style={fondo}>
      <div style={tarjeta}>
        <div style={{ fontSize: "2.5rem" }}>💵</div>
        <h1 style={titulo}>La caja está cerrada</h1>
        <p style={texto}>
          Para vender hay que abrir el turno de caja y declarar con cuánto efectivo se arranca.
        </p>
        <div style={ayuda}>
          Así el arqueo del cierre tiene contra qué compararse: todas las ventas y los movimientos
          del día quedan colgados de ese turno. Es un solo paso y se hace una vez por jornada.
        </div>
        {onAbrirCaja !== undefined && (
          <button type="button" style={boton} onClick={onAbrirCaja}>
            Ir a Caja para abrir el turno
          </button>
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
const titulo: CSSProperties = { fontSize: "1.5rem", fontWeight: 700, color: "#0f172a", margin: 0 };
const texto: CSSProperties = { fontSize: "1.05rem", color: "#334155", margin: 0 };
const ayuda: CSSProperties = {
  background: "#f8fafc",
  color: "#475569",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  fontSize: "0.9rem",
  textAlign: "left",
};
const boton: CSSProperties = {
  padding: "0.7rem 1.4rem",
  borderRadius: 8,
  border: "none",
  background: "#1C97B0",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
