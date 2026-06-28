import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { PantallaPos } from "./componentes/PantallaPos";
import { PantallaLogin } from "./componentes/PantallaLogin";
import { PantallaTerminal } from "./componentes/PantallaTerminal";
import type { EntornoPos } from "./datos/bootstrap";
import { crearEntornoPos } from "./datos/bootstrap";
import { abrirBaseTauri, crearEntornoPosTauri } from "./datos/bootstrap-tauri";
import { EjecutorSqlTauri, estaEnTauri } from "./datos/ejecutor-sql-tauri";
import { SesionManager } from "./datos/sesion";
import { ClienteAuthHttp, type Credenciales } from "./sync/cliente-auth-http";
import { ClienteTerminalesHttp } from "./sync/cliente-terminales-http";

// Base del servidor de sucursal. En 5.4 pasa a ser configurable (hoy fija).
const BASE_URL = "http://localhost:3000/api/v1";

/** Aviso a pantalla completa para estados de carga/error. */
function Aviso({ children }: { children: ReactNode }) {
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
  return estaEnTauri() ? <AppTauri /> : <AppNavegador />;
}

/** Navegador (desarrollo): datos en memoria, sin login. */
function AppNavegador() {
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);
  useEffect(() => {
    setEntorno(crearEntornoPos());
  }, []);
  if (entorno === null) return <Aviso>Iniciando NexoSoft POS…</Aviso>;
  return <PantallaPos entorno={entorno} />;
}

type Fase = "cargando" | "login" | "terminal" | "listo" | "error";

/** App Tauri: abre SQLite, gestiona la sesión (login + terminal) y monta el POS. */
function AppTauri() {
  const ejecutorRef = useRef<EjecutorSqlTauri | null>(null);
  const sesionRef = useRef<SesionManager | null>(null);
  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string>("");
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);

  const fallar = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : String(e));
    setFase("error");
  }, []);

  const construirEntorno = useCallback(async () => {
    const sesion = sesionRef.current;
    const ejecutor = ejecutorRef.current;
    if (sesion === null || ejecutor === null) return;
    setFase("cargando");
    try {
      await sesion.asegurarTokenVigente();
      const env = await crearEntornoPosTauri({
        ejecutor,
        baseUrlSync: BASE_URL,
        obtenerToken: () => sesion.obtenerToken(),
        ...(sesion.terminalId !== undefined ? { terminalId: sesion.terminalId } : {}),
      });
      setEntorno(env);
      setFase("listo");
    } catch (e) {
      fallar(e);
    }
  }, [fallar]);

  const avanzar = useCallback(
    (sesion: SesionManager) => {
      if (!sesion.haySesion()) return setFase("login");
      if (!sesion.hayTerminal()) return setFase("terminal");
      void construirEntorno();
    },
    [construirEntorno],
  );

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const ejecutor = await abrirBaseTauri();
        const sesion = await SesionManager.cargar(ejecutor, new ClienteAuthHttp(BASE_URL));
        if (!activo) return;
        ejecutorRef.current = ejecutor;
        sesionRef.current = sesion;
        avanzar(sesion);
      } catch (e) {
        if (activo) fallar(e);
      }
    })();
    return () => {
      activo = false;
    };
  }, [avanzar, fallar]);

  const onLogin = useCallback(
    async (cred: Credenciales) => {
      const sesion = sesionRef.current;
      if (sesion === null) return;
      await sesion.login(cred);
      avanzar(sesion);
    },
    [avanzar],
  );

  const onElegirTerminal = useCallback(
    async (id: string, nombre: string) => {
      const sesion = sesionRef.current;
      if (sesion === null) return;
      await sesion.elegirTerminal(id, nombre);
      void construirEntorno();
    },
    [construirEntorno],
  );

  const onCerrarSesion = useCallback(async () => {
    const sesion = sesionRef.current;
    if (sesion === null) return;
    await sesion.cerrar();
    setEntorno(null);
    setFase("login");
  }, []);

  const listarTerminales = useCallback(
    () => new ClienteTerminalesHttp(BASE_URL, () => sesionRef.current?.obtenerToken() ?? null).listar(),
    [],
  );

  if (fase === "error") return <Aviso>No se pudo iniciar el POS: {error}</Aviso>;
  if (fase === "login") return <PantallaLogin onLogin={onLogin} />;
  if (fase === "terminal") return <PantallaTerminal listar={listarTerminales} onElegir={onElegirTerminal} />;
  if (fase === "listo" && entorno !== null) {
    return (
      <PantallaPos
        entorno={entorno}
        {...(sesionRef.current?.terminalNombre !== undefined
          ? { terminalNombre: sesionRef.current.terminalNombre }
          : {})}
        onCerrarSesion={() => void onCerrarSesion()}
      />
    );
  }
  return <Aviso>Iniciando NexoSoft POS…</Aviso>;
}
