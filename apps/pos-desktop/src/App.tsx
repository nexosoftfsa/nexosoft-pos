import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { MockLectorDeBarras } from "@nexosoft/hardware";
import { CondicionIva } from "@nexosoft/domain";

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
import { chequearYDescargarEnSilencio } from "./datos/actualizaciones";
import { leerServidorUrl, guardarServidorUrl } from "./datos/ajustes-sqlite";
import {
  guardarSuscripcion,
  leerSuscripcionGuardada,
  SUSCRIPCION_ACTIVA,
} from "./datos/suscripcion";
import { ClienteLicenciaHttp } from "./sync/cliente-licencia-http";
import { EjecutorSqlTauri, estaEnTauri } from "./datos/ejecutor-sql-tauri";
import { SesionManager } from "./datos/sesion";
import { ClienteAuthHttp, ErrorAuth, type Credenciales } from "./sync/cliente-auth-http";
import { ClienteTerminalesHttp } from "./sync/cliente-terminales-http";
import { ClienteComercioHttp } from "./sync/cliente-comercio-http";
import type { ClienteCatalogoAdmin } from "./sync/cliente-catalogo-admin";
import { ClienteCatalogoAdminHttp } from "./sync/cliente-catalogo-admin";
import { ClienteCatalogoAdminSimulado } from "./sync/cliente-catalogo-admin-simulado";
import type { ClienteStock } from "./sync/cliente-stock";
import { ClienteStockHttp } from "./sync/cliente-stock";
import { ClienteStockSimulado } from "./sync/cliente-stock-simulado";
import type { ClienteCaja } from "./sync/cliente-caja";
import { ClienteCajaHttp } from "./sync/cliente-caja";
import { ClienteCajaSimulado } from "./sync/cliente-caja-simulado";
import type { ClienteCtaCte } from "./sync/cliente-ctacte";
import { ClienteCtaCteHttp } from "./sync/cliente-ctacte";
import { ClienteCtaCteSimulado } from "./sync/cliente-ctacte-simulado";
import type { ClienteVentas } from "./sync/cliente-ventas";
import { ClienteVentasHttp } from "./sync/cliente-ventas";
import { ClienteVentasSimulado } from "./sync/cliente-ventas-simulado";
import type { ClienteReportes } from "./sync/cliente-reportes";
import { ClienteReportesHttp } from "./sync/cliente-reportes";
import { ClienteReportesSimulado } from "./sync/cliente-reportes-simulado";
import type { ClientePresupuestos } from "./sync/cliente-presupuestos";
import { ClientePresupuestosHttp } from "./sync/cliente-presupuestos";
import { ClientePresupuestosSimulado } from "./sync/cliente-presupuestos-simulado";
import type { ClienteRemitos } from "./sync/cliente-remitos";
import { ClienteRemitosHttp } from "./sync/cliente-remitos";
import { ClienteRemitosSimulado } from "./sync/cliente-remitos-simulado";
import type { ClienteProveedores } from "./sync/cliente-proveedores";
import { ClienteProveedoresHttp } from "./sync/cliente-proveedores";
import { ClienteProveedoresSimulado } from "./sync/cliente-proveedores-simulado";
import type { ClienteMediosPago } from "./sync/cliente-medios-pago";
import { ClienteMediosPagoHttp } from "./sync/cliente-medios-pago";
import { ClienteMediosPagoSimulado } from "./sync/cliente-medios-pago-simulado";
import type { AsistenteIA } from "./sync/cliente-ia";
import { AsistenteIAHttp } from "./sync/cliente-ia";
import type { ClienteAsistenteConfig } from "./sync/cliente-asistente-config";
import { ClienteAsistenteConfigHttp } from "./sync/cliente-asistente-config";
import type { ClienteUsuarios } from "./sync/cliente-usuarios-http";
import { ClienteUsuariosHttp } from "./sync/cliente-usuarios-http";
import { ClienteUsuariosSimulado } from "./sync/cliente-usuarios-simulado";
import type { ClienteCredenciales } from "./sync/cliente-credenciales-http";
import { ClienteCredencialesHttp } from "./sync/cliente-credenciales-http";

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

/**
 * Navegador (desarrollo): datos en memoria, sin login.
 *
 * `?pantalla=config` abre la Configuración con datos de mentira. Es la única
 * forma de verla en el navegador: en modo demo no hay login ni fase de
 * config, así que la pantalla quedaba fuera de todo desarrollo visual — tanto
 * que sus tarjetas venían sin estilo (las clases `.card` viven bajo
 * `.gestion` y nadie lo había notado).
 */
function AppNavegador() {
  if (new URLSearchParams(location.search).get("pantalla") === "config") {
    return (
      <PantallaConfig
        valores={{
          servidorUrl: "http://localhost:3000/api/v1",
          razonSocial: "NexoSoft Almacén (demo)",
          cuit: "30-71234567-8",
          condicionIvaEmisor: CondicionIva.ResponsableInscripto,
          puntoDeVenta: 1,
          emiteComprobantesFiscales: false,
          permitirStockNegativo: true,
        }}
        onGuardar={async () => {}}
        onCancelar={() => {}}
        obtenerToken={() => null}
      />
    );
  }
  return <AppDemo />;
}

/**
 * Modo DEMO autocontenido: todo en memoria (catálogo, combos, lotes, promos,
 * cuentas corrientes…), sin backend ni login. Lo usa el navegador de desarrollo y
 * el botón "Modo demo" de la app instalada, para que alguien pueda probar el POS
 * sin levantar el servidor de sucursal.
 *
 * `onSalir`, si se pasa (solo desde `AppTauri`), habilita el botón de "Salir del
 * modo demo" en el sidebar para volver al login/terminal real.
 */
function AppDemo({ onSalir }: { onSalir?: () => void } = {}) {
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);
  const clienteCatalogoRef = useRef<ClienteCatalogoAdmin | null>(null);
  const clienteStockRef = useRef<ClienteStock | null>(null);
  const clienteCajaRef = useRef<ClienteCaja | null>(null);
  const clienteCtaCteRef = useRef<ClienteCtaCte | null>(null);
  const clienteVentasRef = useRef<ClienteVentas | null>(null);
  const clienteReportesRef = useRef<ClienteReportes | null>(null);
  const clientePresupuestosRef = useRef<ClientePresupuestos | null>(null);
  const clienteRemitosRef = useRef<ClienteRemitos | null>(null);
  const clienteProveedoresRef = useRef<ClienteProveedores | null>(null);
  const clienteMediosPagoRef = useRef<ClienteMediosPago | null>(null);
  const clienteUsuariosRef = useRef<ClienteUsuarios | null>(null);
  useEffect(() => {
    setEntorno(crearEntornoPos());
    clienteUsuariosRef.current = new ClienteUsuariosSimulado();
    clienteCatalogoRef.current = new ClienteCatalogoAdminSimulado();
    clienteStockRef.current = new ClienteStockSimulado();
    clienteCajaRef.current = new ClienteCajaSimulado();
    clienteCtaCteRef.current = new ClienteCtaCteSimulado();
    clienteVentasRef.current = new ClienteVentasSimulado();
    clienteReportesRef.current = new ClienteReportesSimulado();
    clientePresupuestosRef.current = new ClientePresupuestosSimulado();
    clienteRemitosRef.current = new ClienteRemitosSimulado();
    clienteProveedoresRef.current = new ClienteProveedoresSimulado();
    clienteMediosPagoRef.current = new ClienteMediosPagoSimulado();
  }, []);
  if (entorno === null) return <Aviso>Iniciando NexoSoft POS…</Aviso>;
  // En desarrollo (navegador) no hay login: mostramos el shell completo como ADMIN
  // y los módulos de gestión corren contra clientes simulados en memoria.
  return (
    <Shell
      entorno={entorno}
      usuario={{ rol: "ADMIN", email: "demo@nexosoft.local" }}
      terminalId="caja-demo"
      {...(clienteCatalogoRef.current !== null
        ? { clienteCatalogo: clienteCatalogoRef.current }
        : {})}
      {...(clienteStockRef.current !== null ? { clienteStock: clienteStockRef.current } : {})}
      {...(clienteCajaRef.current !== null ? { clienteCaja: clienteCajaRef.current } : {})}
      {...(clienteCtaCteRef.current !== null ? { clienteCtaCte: clienteCtaCteRef.current } : {})}
      {...(clienteVentasRef.current !== null ? { clienteVentas: clienteVentasRef.current } : {})}
      {...(clienteReportesRef.current !== null
        ? { clienteReportes: clienteReportesRef.current }
        : {})}
      {...(clientePresupuestosRef.current !== null
        ? { clientePresupuestos: clientePresupuestosRef.current }
        : {})}
      {...(clienteRemitosRef.current !== null ? { clienteRemitos: clienteRemitosRef.current } : {})}
      {...(clienteProveedoresRef.current !== null
        ? { clienteProveedores: clienteProveedoresRef.current }
        : {})}
      {...(clienteMediosPagoRef.current !== null
        ? { clienteMediosPago: clienteMediosPagoRef.current }
        : {})}
      {...(clienteUsuariosRef.current !== null
        ? { clienteUsuarios: clienteUsuariosRef.current }
        : {})}
      {...(onSalir ? { onCerrarSesion: onSalir, tituloCerrarSesion: "Salir del modo demo" } : {})}
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
  const clienteStockRef = useRef<ClienteStock | null>(null);
  const clienteCajaRef = useRef<ClienteCaja | null>(null);
  const clienteCtaCteRef = useRef<ClienteCtaCte | null>(null);
  const clienteVentasRef = useRef<ClienteVentas | null>(null);
  const clienteReportesRef = useRef<ClienteReportes | null>(null);
  const clientePresupuestosRef = useRef<ClientePresupuestos | null>(null);
  const clienteRemitosRef = useRef<ClienteRemitos | null>(null);
  const clienteProveedoresRef = useRef<ClienteProveedores | null>(null);
  const clienteMediosPagoRef = useRef<ClienteMediosPago | null>(null);
  const clienteIARef = useRef<AsistenteIA | null>(null);
  const clienteAsistenteConfigRef = useRef<ClienteAsistenteConfig | null>(null);
  const clienteUsuariosRef = useRef<ClienteUsuarios | null>(null);
  const clienteCredencialesRef = useRef<ClienteCredenciales | null>(null);
  // No hay lector serial real todavía (ver packages/hardware/src/lector.ts): los
  // lectores HID se capturan como teclado (`useLectorTeclado`), así que esta
  // instancia solo necesita existir como referencia estable — no depende de la
  // sesión ni de `entorno`, por eso se crea una sola vez, antes del login.
  const lectorLoginRef = useRef(new MockLectorDeBarras());
  const [fase, setFase] = useState<Fase>("cargando");
  const [suscripcion, setSuscripcion] = useState(SUSCRIPCION_ACTIVA);
  const [error, setError] = useState<string>("");
  const [entorno, setEntorno] = useState<EntornoPos | null>(null);
  const [valoresConfig, setValoresConfig] = useState<ValoresConfig | null>(null);
  const [modoDemo, setModoDemo] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(undefined);

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
      // ABM de catálogo y stock online contra el servidor de sucursal (mismo token).
      clienteCatalogoRef.current = new ClienteCatalogoAdminHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteStockRef.current = new ClienteStockHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteCajaRef.current = new ClienteCajaHttp(baseUrlRef.current, () => sesion.obtenerToken());
      clienteCtaCteRef.current = new ClienteCtaCteHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteVentasRef.current = new ClienteVentasHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteReportesRef.current = new ClienteReportesHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clientePresupuestosRef.current = new ClientePresupuestosHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteRemitosRef.current = new ClienteRemitosHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteProveedoresRef.current = new ClienteProveedoresHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteMediosPagoRef.current = new ClienteMediosPagoHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteIARef.current = new AsistenteIAHttp(baseUrlRef.current, () => sesion.obtenerToken());
      clienteAsistenteConfigRef.current = new ClienteAsistenteConfigHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      clienteUsuariosRef.current = new ClienteUsuariosHttp(
        baseUrlRef.current,
        () => sesion.obtenerToken(),
        sesion.sucursalId ?? "",
      );
      clienteCredencialesRef.current = new ClienteCredencialesHttp(baseUrlRef.current, () =>
        sesion.obtenerToken(),
      );
      setEntorno(env);
      setFase("listo");
    } catch (e) {
      // Refresh token inválido/expirado (servidor reinstalado, sesión vieja, etc.):
      // la sesión guardada ya no sirve. En vez de un error sin salida, limpiamos
      // y volvemos al login para que el usuario pueda entrar de nuevo.
      if (e instanceof ErrorAuth && e.status === 401) {
        await sesion.cerrar();
        setFase("login");
        return;
      }
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
  const inicializar = useCallback(
    async ({ pedirCredenciales = false }: { pedirCredenciales?: boolean } = {}) => {
      setFase("cargando");
      try {
        const ejecutor = ejecutorRef.current ?? (await abrirBaseTauri());
        ejecutorRef.current = ejecutor;
        await asegurarMaestros(ejecutor);
        baseUrlRef.current = await leerServidorUrl(ejecutor);
        setLogoDataUrl((await leerConfig(ejecutor)).logoDataUrl);
        const sesion = await SesionManager.cargar(ejecutor, new ClienteAuthHttp(baseUrlRef.current));
        sesionRef.current = sesion;
        // La sesión igual se carga: guarda la terminal elegida (que es de la
        // máquina) y el refresh token. Lo que no se hace es entrar con ella
        // sin preguntar.
        if (pedirCredenciales) {
          setFase("login");
          return;
        }
        avanzar(sesion);
      } catch (e) {
        fallar(e);
      }
    },
    [avanzar, fallar],
  );

  // Al abrir la app SIEMPRE se piden credenciales, aunque haya una sesión
  // guardada y vigente. La terminal es compartida: si reabriera en la sesión
  // de quien la usó antes, las ventas y los movimientos de caja quedarían a
  // nombre de alguien que ya no está adelante de la pantalla.
  useEffect(() => {
    void inicializar({ pedirCredenciales: true });
  }, [inicializar]);

  // Chequeo de actualización en silencio al iniciar: si hay una nueva, se
  // descarga sola; recién se instala cuando el usuario toca "Reiniciar para
  // actualizar" (banner del costado) o "Instalar y reiniciar" (Configuración).
  useEffect(() => {
    void chequearYDescargarEnSilencio();
  }, []);

  // El access token dura minutos (JWT_ACCESS_EXPIRY); sin este chequeo periódico
  // solo se renueva una vez, al loguearse — cualquier acción después de que
  // venza responde 401 "Unauthorized" hasta reiniciar la app. Se fija cada
  // minuto (bien por debajo del margen de refresh de asegurarTokenVigente) para
  // no dejar pasar la ventana en la que conviene renovar.
  useEffect(() => {
    const id = setInterval(() => {
      const sesion = sesionRef.current;
      if (sesion === null) return;
      void sesion.asegurarTokenVigente().catch((e: unknown) => {
        // Refresh token también vencido/inválido: no hay forma de seguir sin
        // reloguear. Igual que el 401 de construirEntorno, se vuelve al login.
        if (e instanceof ErrorAuth && e.status === 401) {
          void sesion.cerrar().then(() => setFase("login"));
        }
      });
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Estado de la suscripción (Fase 17.B, ADR-0056). Se le pregunta al servidor
  // —que es quien verifica la firma— y se guarda en SQLite: el POS puede
  // vender sin el servidor (ADR-0004), así que si el bloqueo viviera sólo del
  // lado del servidor, alcanzaría con desenchufar la red para seguir vendiendo.
  const refrescarSuscripcion = useCallback(async () => {
    const ejecutor = ejecutorRef.current;
    if (ejecutor === null) return;
    const delServidor = await new ClienteLicenciaHttp(
      baseUrlRef.current,
      () => sesionRef.current?.obtenerToken() ?? null,
    ).obtener();
    if (delServidor === null) {
      // Sin respuesta: se sigue con lo último que se sepa.
      setSuscripcion(await leerSuscripcionGuardada(ejecutor));
      return;
    }
    await guardarSuscripcion(ejecutor, delServidor);
    setSuscripcion(delServidor);
  }, []);

  useEffect(() => {
    if (fase !== "listo") return;
    void refrescarSuscripcion();
    // Cada minuto. Es una llamada al servidor de la propia sucursal (red
    // local), así que no cuesta nada; y los tiempos se SUMAN con los del
    // servidor contra el Worker, así que dejarla lenta acá arruinaba la
    // latencia total aunque el servidor consultara seguido.
    const id = setInterval(() => void refrescarSuscripcion(), 60_000);
    return () => clearInterval(id);
  }, [fase, refrescarSuscripcion]);

  const onLogin = useCallback(
    async (cred: Credenciales) => {
      const sesion = sesionRef.current;
      if (sesion === null) return;
      await sesion.login(cred);
      avanzar(sesion);
    },
    [avanzar],
  );

  const onLoginCredencial = useCallback(
    async (payload: string) => {
      const sesion = sesionRef.current;
      if (sesion === null) return;
      await sesion.loginConCredencial(payload);
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

  // Configuración se abre desde dos lados y hay que volver al que corresponde:
  // desde el login (antes de entrar) o desde el shell (ya trabajando). Sin
  // esto, cancelar en el login dejaba pasar sin credenciales.
  const volverDeConfigRef = useRef<"login" | "listo">("listo");

  const onAbrirConfig = useCallback(async (volverA: "login" | "listo") => {
    volverDeConfigRef.current = volverA;
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
        emiteComprobantesFiscales: config.emiteComprobantesFiscales ?? true,
        permitirStockNegativo: config.permitirStockNegativo,
        ...(config.logoDataUrl !== undefined ? { logoDataUrl: config.logoDataUrl } : {}),
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
      const { logoDataUrl: _logoActual, ...actualSinLogo } = await leerConfig(ejecutor);
      await guardarConfig(ejecutor, {
        ...actualSinLogo,
        razonSocial: v.razonSocial,
        cuit: v.cuit,
        condicionIvaEmisor: v.condicionIvaEmisor,
        puntoDeVenta: v.puntoDeVenta,
        emiteComprobantesFiscales: v.emiteComprobantesFiscales,
        permitirStockNegativo: v.permitirStockNegativo,
        // Sin spread de `undefined`: si el usuario sacó el logo, se omite la
        // clave (guardarConfig la persiste como NULL) en vez de asignarla a
        // `undefined`, que `exactOptionalPropertyTypes` no permite.
        ...(v.logoDataUrl !== undefined ? { logoDataUrl: v.logoDataUrl } : {}),
      });
      await guardarServidorUrl(ejecutor, v.servidorUrl);
      void new ClienteComercioHttp(
        v.servidorUrl,
        () => sesionRef.current?.obtenerToken() ?? null,
      ).actualizarLogo(v.logoDataUrl ?? "");
      // Re-lee la URL, reconstruye el cliente y vuelve de donde vino.
      await inicializar({ pedirCredenciales: volverDeConfigRef.current === "login" });
    },
    [inicializar],
  );

  const onSalirDeConfig = useCallback(() => {
    void inicializar({ pedirCredenciales: volverDeConfigRef.current === "login" });
  }, [inicializar]);

  const clienteTerminales = useCallback(
    () =>
      new ClienteTerminalesHttp(
        baseUrlRef.current,
        () => sesionRef.current?.obtenerToken() ?? null,
      ),
    [],
  );
  const listarTerminales = useCallback(() => clienteTerminales().listar(), [clienteTerminales]);
  const crearTerminal = useCallback(
    (nombre: string) => clienteTerminales().crear(nombre),
    [clienteTerminales],
  );

  // Modo demo autocontenido (sin backend), disparado desde el login.
  if (modoDemo)
    return (
      <AppDemo
        onSalir={() => {
          setModoDemo(false);
          void inicializar({ pedirCredenciales: true });
        }}
      />
    );

  if (fase === "error") {
    return (
      <Aviso>
        <div>
          <p>No se pudo conectar con el servidor de sucursal.</p>
          <p style={{ color: "#64748b", fontSize: "0.9rem", margin: "0.5rem 0 1.25rem" }}>
            {error}
          </p>
          <button
            type="button"
            onClick={() => setModoDemo(true)}
            style={{
              padding: "0.6rem 1.1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#1C97B0",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Probar en modo demo (sin conexión)
          </button>
        </div>
      </Aviso>
    );
  }
  if (fase === "config" && valoresConfig !== null) {
    return (
      <PantallaConfig
        valores={valoresConfig}
        onGuardar={onGuardarConfig}
        onCancelar={onSalirDeConfig}
        obtenerToken={() => sesionRef.current?.obtenerToken() ?? null}
      />
    );
  }
  if (fase === "login")
    return (
      <PantallaLogin
        onLogin={onLogin}
        onLoginCredencial={onLoginCredencial}
        lector={lectorLoginRef.current}
        onConfig={() => void onAbrirConfig("login")}
        onModoDemo={() => setModoDemo(true)}
        {...(logoDataUrl !== undefined ? { logoDataUrl } : {})}
      />
    );
  if (fase === "terminal") {
    const rol = sesionRef.current?.rol;
    const puedeCrearTerminal = rol === "ADMIN" || rol === "SUPERVISOR";
    return (
      <PantallaTerminal
        listar={listarTerminales}
        onElegir={onElegirTerminal}
        {...(puedeCrearTerminal ? { crear: crearTerminal } : {})}
      />
    );
  }
  if (fase === "listo" && entorno !== null) {
    return (
      <Shell
        entorno={entorno}
        // Fase 17.B (ADR-0056): el Shell decide qué hacer con cada módulo.
        // No se tapa todo el sistema: bloqueada la suscripción, la venta
        // muestra la pantalla de bloqueo pero Caja y los reportes siguen
        // andando, para poder cerrar el turno y consultar lo histórico.
        suscripcion={suscripcion}
        usuario={{
          ...(sesionRef.current?.usuarioId !== undefined
            ? { id: sesionRef.current.usuarioId }
            : {}),
          ...(sesionRef.current?.email !== undefined ? { email: sesionRef.current.email } : {}),
          ...(sesionRef.current?.rol !== undefined ? { rol: sesionRef.current.rol } : {}),
        }}
        {...(clienteCatalogoRef.current !== null
          ? { clienteCatalogo: clienteCatalogoRef.current }
          : {})}
        {...(clienteStockRef.current !== null ? { clienteStock: clienteStockRef.current } : {})}
        {...(clienteCajaRef.current !== null ? { clienteCaja: clienteCajaRef.current } : {})}
        {...(clienteCtaCteRef.current !== null ? { clienteCtaCte: clienteCtaCteRef.current } : {})}
        {...(clienteVentasRef.current !== null ? { clienteVentas: clienteVentasRef.current } : {})}
        {...(clienteReportesRef.current !== null
          ? { clienteReportes: clienteReportesRef.current }
          : {})}
        {...(clientePresupuestosRef.current !== null
          ? { clientePresupuestos: clientePresupuestosRef.current }
          : {})}
        {...(clienteRemitosRef.current !== null
          ? { clienteRemitos: clienteRemitosRef.current }
          : {})}
        {...(clienteProveedoresRef.current !== null
          ? { clienteProveedores: clienteProveedoresRef.current }
          : {})}
        {...(clienteMediosPagoRef.current !== null
          ? { clienteMediosPago: clienteMediosPagoRef.current }
          : {})}
        {...(clienteIARef.current !== null ? { clienteIA: clienteIARef.current } : {})}
        {...(clienteAsistenteConfigRef.current !== null
          ? { clienteAsistenteConfig: clienteAsistenteConfigRef.current }
          : {})}
        {...(clienteUsuariosRef.current !== null
          ? { clienteUsuarios: clienteUsuariosRef.current }
          : {})}
        {...(clienteCredencialesRef.current !== null
          ? { clienteCredenciales: clienteCredencialesRef.current }
          : {})}
        {...(sesionRef.current?.terminalId !== undefined
          ? { terminalId: sesionRef.current.terminalId }
          : {})}
        {...(sesionRef.current?.terminalNombre !== undefined
          ? { terminalNombre: sesionRef.current.terminalNombre }
          : {})}
        onCerrarSesion={() => void onCerrarSesion()}
        onAbrirConfig={() => void onAbrirConfig("listo")}
      />
    );
  }
  return <Aviso>Iniciando NexoSoft POS…</Aviso>;
}
