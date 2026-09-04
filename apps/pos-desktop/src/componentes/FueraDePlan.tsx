import type { CSSProperties } from "react";
import { ETIQUETA_PLAN, type Plan } from "@nexosoft/licencias";

/**
 * Pantalla de un módulo que no entra en el plan contratado (ADR-0067 §4).
 *
 * **No es un error y no se disculpa: es una oferta.** El módulo se muestra en
 * el menú con candado justamente para que el comercio sepa que existe; esta
 * pantalla es donde se le cuenta qué hace y en qué plan está. Esconderlo
 * sería más prolijo y vendería menos.
 */
export function PantallaFueraDePlan({
  titulo,
  descripcion,
  planNecesario,
  planActual,
}: {
  /** Nombre del módulo, tal como figura en el menú. */
  titulo: string;
  /** La migaja de pan del módulo: alcanza para decir de qué se trata. */
  descripcion: string;
  planNecesario: Plan;
  planActual: Plan;
}) {
  return (
    <div style={fondo}>
      <div style={tarjeta}>
        <div style={{ fontSize: "2.5rem" }}>🔒</div>
        <h1 style={estiloTitulo}>{titulo}</h1>
        <p style={texto}>{descripcion}</p>
        <div style={etiqueta}>Disponible en el plan {ETIQUETA_PLAN[planNecesario]}</div>
        <div style={ayuda}>
          Tu plan actual es <b>{ETIQUETA_PLAN[planActual]}</b>. Para activar esta función,
          comunicate con NexoSoft: se habilita a distancia, sin reinstalar nada y sin perder
          ninguno de tus datos.
        </div>
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
const estiloTitulo: CSSProperties = {
  fontSize: "1.5rem",
  fontWeight: 700,
  color: "#0f172a",
  margin: 0,
};
const texto: CSSProperties = { fontSize: "1.05rem", color: "#475569", margin: 0 };
const etiqueta: CSSProperties = {
  background: "#ede9fe",
  color: "#5b21b6",
  padding: "0.45rem 0.9rem",
  borderRadius: 999,
  fontSize: "0.95rem",
  fontWeight: 700,
};
const ayuda: CSSProperties = {
  background: "#f8fafc",
  color: "#475569",
  padding: "0.7rem 0.9rem",
  borderRadius: 10,
  fontSize: "0.9rem",
  textAlign: "left",
};
