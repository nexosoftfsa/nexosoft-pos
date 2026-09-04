/**
 * Worker de licencias y panel de clientes (Fase 17.B.2, ADR-0056 y ADR-0067).
 *
 * El estado de cada comercio **se deriva de su fecha de pago** y se calcula al
 * emitir la licencia; el panel sólo fija excepciones (`estadoManual`). Por eso
 * acá no hay ninguna tarea programada: no puede haber un cron que no corrió,
 * ni un estado guardado que quedó viejo. El bloqueo, en cambio, nunca es
 * automático — sale de que alguien apriete el botón.
 *
 * Un solo Worker con dos caras, según el hostname:
 *
 * - `licencias.nexosoft.com.ar` — le responde al `cloud-api` de cada comercio
 *   con su licencia firmada, y anota el heartbeat de soporte.
 * - `admin.nexosoft.com.ar` — nuestro panel de clientes.
 *
 * El panel NO usa usuario y contraseña: se entra con un token largo y
 * aleatorio (`ADMIN_TOKEN`, secret del Worker). No hay nombre de usuario que
 * adivinar ni contraseña que filtrar. Ver ADR-0056 §1.
 */
import { firmarLicencia } from "./firmar";
import {
  esEstadoValido,
  esPlanValido,
  esPrecioValido,
  estadoEfectivo,
  guardarCliente,
  leerCliente,
  licenciaDe,
  listarClientes,
  permitirBloqueo,
  registrarPago,
  soloFecha,
  type Cliente,
} from "./clientes";
import { PANEL_HTML } from "./panel";

export interface Env {
  CLIENTES: KVNamespace;
  /** Clave privada Ed25519 en PKCS#8 base64. Secret, nunca en el repo. */
  LICENCIAS_CLAVE_PRIVADA: string;
  /** Token de acceso al panel. Secret. */
  ADMIN_TOKEN: string;
}

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function json(datos: unknown, status = 200): Response {
  return new Response(JSON.stringify(datos), { status, headers: JSON_HEADERS });
}

/**
 * Compara en tiempo constante, para no filtrar el token carácter por carácter
 * midiendo cuánto tarda la respuesta.
 */
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

function autorizado(pedido: Request, env: Env): boolean {
  const cabecera = pedido.headers.get("Authorization") ?? "";
  const token = (cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "").trim();
  // El secreto se carga por stdin y ahí es fácil que se cuele un salto de
  // línea; un carácter invisible no puede dejarnos afuera de nuestro propio
  // panel. Se compara sin espacios de los dos lados.
  const esperado = (env.ADMIN_TOKEN ?? "").trim();
  return esperado !== "" && igualSeguro(token, esperado);
}

// ─── Cara pública: la licencia de cada comercio ──────────────────────────────

async function emitirLicencia(pedido: Request, env: Env): Promise<Response> {
  let cuerpo: { comercioId?: unknown; version?: unknown };
  try {
    cuerpo = (await pedido.json()) as typeof cuerpo;
  } catch {
    return json({ error: "Cuerpo inválido" }, 400);
  }
  const comercioId = typeof cuerpo.comercioId === "string" ? cuerpo.comercioId : "";
  if (comercioId === "") return json({ error: "Falta comercioId" }, 400);

  const cliente = await leerCliente(env.CLIENTES, comercioId);
  // Un comercio que no está en el padrón no recibe licencia. Eso NO lo
  // bloquea: sin licencia el sistema opera igual (ADR-0056 §3). Simplemente
  // no hay nada que decirle.
  if (cliente === null) return json({ error: "Comercio no registrado" }, 404);

  const ahora = new Date();
  // Heartbeat de soporte: sólo identificador, versión y fecha. Nada del negocio.
  cliente.ultimoContacto = ahora.toISOString();
  cliente.ultimaVersion = typeof cuerpo.version === "string" ? cuerpo.version : null;
  await guardarCliente(env.CLIENTES, cliente);

  const token = await firmarLicencia(licenciaDe(cliente, ahora), env.LICENCIAS_CLAVE_PRIVADA);
  return json({ token });
}

// ─── Cara privada: el panel ──────────────────────────────────────────────────

async function apiPanel(pedido: Request, env: Env, ruta: string): Promise<Response> {
  if (!autorizado(pedido, env)) return json({ error: "No autorizado" }, 401);

  const hoy = soloFecha(new Date());

  if (ruta === "/api/clientes" && pedido.method === "GET") {
    const clientes = await listarClientes(env.CLIENTES);
    // El panel muestra el estado **efectivo** (lo fijado a mano, o lo que dice
    // el calendario) y además si ese comercio va en automático.
    return json(
      clientes.map((c) => ({
        ...c,
        estado: estadoEfectivo(c, hoy),
        automatico: c.estadoManual === null || c.estadoManual === undefined,
      })),
    );
  }

  if (ruta === "/api/clientes" && pedido.method === "POST") {
    const cuerpo = (await pedido.json()) as Partial<Cliente>;
    const comercioId = (cuerpo.comercioId ?? "").trim();
    if (comercioId === "") return json({ error: "Falta comercioId" }, 400);
    if (cuerpo.plan !== undefined && !esPlanValido(cuerpo.plan)) {
      return json({ error: "Plan inválido" }, 400);
    }
    if (cuerpo.precioMensual != null && !esPrecioValido(cuerpo.precioMensual)) {
      return json({ error: "Precio inválido: se espera { moneda: \"USD\", importe: \"50\" }" }, 400);
    }
    const existente = await leerCliente(env.CLIENTES, comercioId);
    const cliente: Cliente = {
      comercioId,
      nombre: cuerpo.nombre ?? existente?.nombre ?? comercioId,
      // El alta nunca fija estado: nace en automático y escala por fecha.
      estadoManual: existente?.estadoManual ?? null,
      // Un alta sin plan nace en BASICA — es una decisión explícita del alta,
      // distinta de la regla de `normalizar`, donde un registro VIEJO sin plan
      // queda en PREMIUM para no quitarle módulos a quien ya los tenía.
      plan: cuerpo.plan ?? existente?.plan ?? "BASICA",
      vencePagoEl: cuerpo.vencePagoEl ?? existente?.vencePagoEl ?? hoy,
      precioMensual: cuerpo.precioMensual ?? existente?.precioMensual ?? null,
      mensaje: cuerpo.mensaje ?? existente?.mensaje ?? null,
      creadoEn: existente?.creadoEn ?? new Date().toISOString(),
      ultimoContacto: existente?.ultimoContacto ?? null,
      ultimaVersion: existente?.ultimaVersion ?? null,
      historial: existente?.historial ?? [],
    };
    await guardarCliente(env.CLIENTES, cliente);
    return json(cliente);
  }

  const cambioEstado = /^\/api\/clientes\/([^/]+)\/estado$/.exec(ruta);
  if (cambioEstado !== null && pedido.method === "POST") {
    const comercioId = decodeURIComponent(cambioEstado[1] ?? "");
    const cuerpo = (await pedido.json()) as { estado?: unknown; mensaje?: unknown };
    // `null` es válido y significa "volvé a automático".
    const nuevo = cuerpo.estado === null ? null : cuerpo.estado;
    if (nuevo !== null && !esEstadoValido(nuevo)) return json({ error: "Estado inválido" }, 400);

    const cliente = await leerCliente(env.CLIENTES, comercioId);
    if (cliente === null) return json({ error: "No existe ese comercio" }, 404);

    // Válvula de seguridad: bloquear tiene tope diario, desbloquear no.
    if (nuevo === "BLOQUEADA" && estadoEfectivo(cliente, hoy) !== "BLOQUEADA") {
      const permitido = await permitirBloqueo(env.CLIENTES, hoy);
      if (!permitido) {
        return json(
          {
            error:
              "Se alcanzó el tope de bloqueos por día. Es una protección: si de verdad hay que bloquear más comercios hoy, esperá a mañana o revisá si alguien tiene el token del panel.",
          },
          429,
        );
      }
    }

    cliente.estadoManual = nuevo;
    if (typeof cuerpo.mensaje === "string") cliente.mensaje = cuerpo.mensaje.trim() || null;
    const anotacion =
      nuevo === null
        ? { fecha: new Date().toISOString(), estado: null, nota: "automático" }
        : { fecha: new Date().toISOString(), estado: nuevo };
    cliente.historial = [...(cliente.historial ?? []), anotacion].slice(-50);
    await guardarCliente(env.CLIENTES, cliente);
    return json({ ...cliente, estado: estadoEfectivo(cliente, hoy) });
  }

  // "El cliente pagó": corre la fecha un mes y levanta cualquier estado manual,
  // bloqueo incluido. Desbloquear es siempre inmediato (ADR-0056 §1).
  const pago = /^\/api\/clientes\/([^/]+)\/pago$/.exec(ruta);
  if (pago !== null && pedido.method === "POST") {
    const comercioId = decodeURIComponent(pago[1] ?? "");
    const cliente = await leerCliente(env.CLIENTES, comercioId);
    if (cliente === null) return json({ error: "No existe ese comercio" }, 404);

    const pagado = registrarPago(cliente, hoy);
    pagado.historial = [
      ...(cliente.historial ?? []),
      { fecha: new Date().toISOString(), estado: null, nota: `pago hasta ${pagado.vencePagoEl}` },
    ].slice(-50);
    await guardarCliente(env.CLIENTES, pagado);
    return json({ ...pagado, estado: estadoEfectivo(pagado, hoy) });
  }

  return json({ error: "No encontrado" }, 404);
}

export default {
  async fetch(pedido: Request, env: Env): Promise<Response> {
    const url = new URL(pedido.url);
    const esAdmin = url.hostname.startsWith("admin.");

    if (!esAdmin) {
      if (url.pathname === "/licencia" && pedido.method === "POST") {
        return emitirLicencia(pedido, env);
      }
      // Nada más se expone del lado público: ni listados, ni estados, ni el
      // panel. Un comercio sólo puede pedir SU licencia.
      return json({ error: "No encontrado" }, 404);
    }

    if (url.pathname.startsWith("/api/")) return apiPanel(pedido, env, url.pathname);
    if (url.pathname === "/" || url.pathname === "") {
      return new Response(PANEL_HTML, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
    return json({ error: "No encontrado" }, 404);
  },
};
