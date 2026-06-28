import { useEffect, useState } from "react";

import { PantallaPos } from "./componentes/PantallaPos";
import type { EntornoPos } from "./datos/bootstrap";
import { crearEntornoPos } from "./datos/bootstrap";
import { crearEntornoPosTauri } from "./datos/bootstrap-tauri";
import { estaEnTauri } from "./datos/ejecutor-sql-tauri";

/** Mensaje a pantalla completa para los estados de carga y error del arranque. */
function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "system-ui, sans-serif",
        color: "#334155",
        padding: "2rem",
        textAlign: "center",
      }}
    >
      {children}
    </div>
  );
}

export function App() {
  // En el navegador el entorno usa datos en memoria (sincrónico); en Tauri abre
  // SQLite y sincroniza por HTTP (asincrónico), por eso el arranque es async.
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    const cargar = estaEnTauri()
      ? crearEntornoPosTauri()
      : Promise.resolve(crearEntornoPos());
    cargar
      .then((e) => {
        if (activo) setEntorno(e);
      })
      .catch((e: unknown) => {
        if (activo) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      activo = false;
    };
  }, []);

  if (error !== null) return <Aviso>No se pudo iniciar el POS: {error}</Aviso>;
  if (entorno === null) return <Aviso>Iniciando NexoSoft POS…</Aviso>;
  return <PantallaPos entorno={entorno} />;
}
