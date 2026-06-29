import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { Shell } from "./shell/Shell";
import { PantallaLogin } from "./componentes/PantallaLogin";
import { PantallaTerminal } from "./componentes/PantallaTerminal";
import { PantallaConfig, type ValoresConfig } from "./componentes/PantallaConfig";
import type { EntornoPos } from "./datos/bootstrap";
import { crearEntornoPos } from "./datos/bootstrap";
import {
  abrirBaseTauri,
  asegurarMaestros,
  crearEntornoPosTauri,
  guardarConfig,
  leerConfig,
} from "./datos/bootstrap-tauri";
import { leerServidorUrl, guardarServidorUrl } from "./datos/ajustes-sqlite";
import { EjecutorSqlTauri, estaEnTauri } from "./datos/ejecutor-sql-tauri";
import { SesionManager } from "./datos/sesion";
import { ClienteAuthHttp, type Credenciales } from "./sync/cliente-auth-http";
import { ClienteTerminalesHttp } from "./sync/cliente-terminales-http";
import type { ClienteCatalogoAdmin } from "./sync/cliente-catalogo-admin";
import { ClienteCatalogoAdminHttp } from "./sync/cliente-catalogo-admin";
import { ClienteCatalogoAdminSimulado } from "./sync/cliente-catalogo-admin-simulado";

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
  const clienteCatalogoRef = useRef<ClienteCatalogoAdmin | null>(null);
  useEffect(() => {
    setEntorno(crearEntornoPos());
    clienteCatalogoRef.current = new ClienteCatalogoAdminSimulado();
  }, []);
  if (entorno === null) return <Aviso>Iniciando NexoSoft POS…</Aviso>;
  // En desarrollo (navegador) no hay login: mostramos el shell completo como ADMIN
  // y el ABM de catálogo corre contra un cliente simulado en memoria.
  return (
    <Shell
      entorno={entorno}
      usuario={{ rol: "ADMIN", email: "demo@nexosoft.local" }}
      {...(clienteCatalogoRef.current !== null ? { clienteCatalogo: clienteCatalogoRef.current } : {})}
    />
  );
}

type Fase = "cargando" | "login" | "terminal" | "config" | "listo" | "error";

/** App Tauri: abre SQLite, gestiona sesión (login + terminal), config y monta el POS. */
function AppTauri() {
  const ejecutorRef = useRef<EjecutorSqlTauri | null>(null);
  const sesionRef = useRef<SesionManager | null>(null);
  const baseUrlRef = useRef<string>("");
  const clienteCatalogoRef = useRef<ClienteCatalogoAdmin | null>(null);
  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string>("");
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);
  const [valoresConfig, setValoresConfig] = useState<ValoresConfig | null>(null);

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
        baseUrlSync: baseUrlRef.current,
        obtenerToken: () => sesion.obtenerToken(),
        ...(sesion.terminalId !== undefined ? { terminalId: sesion.terminalId } : {}),
      });
      // ABM de catálogo online contra el servidor de sucursal (mismo token).
      clienteCatalogoRef.current = new ClienteCatalogoAdminHttp(
        baseUrlRef.current,
        () => sesion.obtenerToken(),
      );
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

  /** Abre la base, lee la URL del servidor, carga la sesión y evalúa la fase. */
  const inicializar = useCallback(async () => {
    setFase("cargando");
    try {
      const ejecutor = ejecutorRef.current ?? (await abrirBaseTauri());
      ejecutorRef.current = ejecutor;
      await asegurarMaestros(ejecutor);
      baseUrlRef.current = await leerServidorUrl(ejecutor);
      const sesion = await SesionManager.cargar(ejecutor, new ClienteAuthHttp(baseUrlRef.current));
      sesionRef.current = sesion;
      avanzar(sesion);
    } catch (e) {
      fallar(e);
    }
  }, [avanzar, fallar]);

  useEffect(() => {
    void inicializar();
  }, [inicializar]);

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

  const onAbrirConfig = useCallback(async () => {
    const ejecutor = ejecutorRef.current;
    if (ejecutor === null) return;
    try {
      const config = await leerConfig(ejecutor);
      setValoresConfig({
        servidorUrl: baseUrlRef.current,
        razonSocial: config.razonSocial,
        cuit: config.cuit,
        condicionIvaEmisor: config.condicionIvaEmisor,
        puntoDeVenta: config.puntoDeVenta,
      });
      setFase("config");
    } catch (e) {
      fallar(e);
    }
  }, [fallar]);

  const onGuardarConfig = useCallback(
    async (v: ValoresConfig) => {
      const ejecutor = ejecutorRef.current;
      if (ejecutor === null) return;
      const actual = await leerConfig(ejecutor);
      await guardarConfig(ejecutor, {
        ...actual,
        razonSocial: v.razonSocial,
        cuit: v.cuit,
        condicionIvaEmisor: v.condicionIvaEmisor,
        puntoDeVenta: v.puntoDeVenta,
      });
      await guardarServidorUrl(ejecutor, v.servidorUrl);
      await inicializar(); // re-lee la URL, reconstruye el cliente y reevalúa la fase
    },
    [inicializar],
  );

  const listarTerminales = useCallback(
    () => new ClienteTerminalesHttp(baseUrlRef.current, () => sesionRef.current?.obtenerToken() ?? null).listar(),
    [],
  );

  if (fase === "error") return <Aviso>No se pudo iniciar el POS: {error}</Aviso>;
  if (fase === "config" && valoresConfig !== null) {
    return (
      <PantallaConfig
        valores={valoresConfig}
        onGuardar={onGuardarConfig}
        onCancelar={() => void inicializar()}
      />
    );
  }
  if (fase === "login") return <PantallaLogin onLogin={onLogin} onConfig={() => void onAbrirConfig()} />;
  if (fase === "terminal") return <PantallaTerminal listar={listarTerminales} onElegir={onElegirTerminal} />;
  if (fase === "listo" && entorno !== null) {
    return (
      <Shell
        entorno={entorno}
        usuario={{
          ...(sesionRef.current?.email !== undefined ? { email: sesionRef.current.email } : {}),
          ...(sesionRef.current?.rol !== undefined ? { rol: sesionRef.current.rol } : {}),
        }}
        {...(clienteCatalogoRef.current !== null ? { clienteCatalogo: clienteCatalogoRef.current } : {})}
        {...(sesionRef.current?.terminalNombre !== undefined
          ? { terminalNombre: sesionRef.current.terminalNombre }
          : {})}
        onCerrarSesion={() => void onCerrarSesion()}
        onAbrirConfig={() => void onAbrirConfig()}
      />
    );
  }
  return <Aviso>Iniciando NexoSoft POS…</Aviso>;
}
