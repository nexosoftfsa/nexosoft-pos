/**
 * Gestión de usuarios (solo ADMIN, ver modulos.tsx): alta, cambio de rol y
 * activar/desactivar. El propio usuario logueado no puede desactivarse ni
 * quitarse el rol de ADMIN a sí mismo (el backend lo bloquea igual; acá se
 * deshabilita para no mostrar un error confuso).
 */
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import { redimensionarImagen } from "../archivos";
import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorUsuarios,
  type CambioPassword,
  type ClienteUsuarios,
  type NuevoUsuario,
  type RolUsuario,
  type UsuarioRemoto,
} from "../sync/cliente-usuarios-http";
import type { ClienteCredenciales } from "../sync/cliente-credenciales-http";
import { CredencialEmpleado } from "./CredencialEmpleado";

const ROLES: ReadonlyArray<{ valor: RolUsuario; etiqueta: string }> = [
  { valor: "ADMIN", etiqueta: "Administrador" },
  { valor: "SUPERVISOR", etiqueta: "Supervisor" },
  { valor: "CAJERO", etiqueta: "Cajero" },
];

/**
 * Tope solo para descartar un archivo disparatado antes de intentar
 * procesarlo — el tamaño real que se guarda lo controla `redimensionarImagen`
 * (reescala y comprime), así que una foto de celular normal (unos pocos MB)
 * entra sin problema.
 */
const ARCHIVO_FOTO_MAX_BYTES = 20 * 1024 * 1024;

function mensaje(e: unknown): string {
  if (e instanceof ErrorUsuarios) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function etiquetaRol(rol: RolUsuario): string {
  return ROLES.find((r) => r.valor === rol)?.etiqueta ?? rol;
}

function fecha(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function Usuarios({
  cliente: api,
  clienteCredenciales,
  comercio,
  propioId,
}: {
  cliente: ClienteUsuarios;
  /** Credencial de acceso por código de barras (Fase 15.A). Sin esto, la acción "Credencial" no se muestra. */
  clienteCredenciales?: ClienteCredenciales;
  /** Razón social/logo del comercio, para la credencial impresa. */
  comercio?: { razonSocial: string; logoDataUrl?: string };
  propioId?: string;
}) {
  const [usuarios, setUsuarios] = useState<UsuarioRemoto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [credencialUsuario, setCredencialUsuario] = useState<UsuarioRemoto | null>(null);
  const [claveUsuario, setClaveUsuario] = useState<UsuarioRemoto | null>(null);
  const [avisoOk, setAvisoOk] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setUsuarios(await api.listar());
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [api]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function cambiarRol(u: UsuarioRemoto, rol: RolUsuario) {
    setError(null);
    try {
      await api.actualizar(u.id, { rol });
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function alternarActivo(u: UsuarioRemoto) {
    const accion = u.activo ? "desactivar" : "reactivar";
    if (!window.confirm(`¿Seguro que querés ${accion} a "${u.nombreDisplay}"?`)) return;
    setError(null);
    try {
      await api.actualizar(u.id, { activo: !u.activo });
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportar() {
    try {
      const blob = await exportarExcel([
        {
          nombre: "Usuarios",
          columnas: [
            { titulo: "Nombre", ancho: 24 },
            { titulo: "Email", ancho: 26 },
            { titulo: "Rol" },
            { titulo: "Estado" },
          ],
          filas: usuarios.map((u) => [
            u.nombreDisplay,
            u.email,
            etiquetaRol(u.rol),
            u.activo ? "Activo" : "Inactivo",
          ]),
        },
      ]);
      await descargarBlob("usuarios.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="spacer" />
        <button type="button" className="pill-btn" onClick={() => void exportar()}>
          Exportar
        </button>
        <button
          type="button"
          className="pill-btn pill-btn--primary"
          onClick={() => setCreando(true)}
        >
          + Nuevo usuario
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}
      {avisoOk !== null && <div className="aviso-ok">{avisoOk}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Foto</th>
                <th>Nombre</th>
                <th>Usuario</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Alta</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    Cargando usuarios…
                  </td>
                </tr>
              )}
              {!cargando && usuarios.length === 0 && (
                <tr>
                  <td colSpan={7} className="td-vacio">
                    No hay usuarios para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                usuarios.map((u) => {
                  const esUnoMismo = u.id === propioId;
                  return (
                    <tr key={u.id} className={u.activo ? "" : "fila-inactiva"}>
                      <td>
                        <FotoCelda usuarioId={u.id} cliente={api} onError={(m) => setError(m)} />
                      </td>
                      <td className="strong">
                        {u.nombreDisplay}
                        {esUnoMismo && <span className="muted"> (vos)</span>}
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <select
                          className="input"
                          value={u.rol}
                          disabled={esUnoMismo}
                          title={
                            esUnoMismo
                              ? "No podés quitarte el rol de administrador a vos mismo"
                              : undefined
                          }
                          onChange={(e) => void cambiarRol(u, e.target.value as RolUsuario)}
                        >
                          {ROLES.map((r) => (
                            <option key={r.valor} value={r.valor}>
                              {r.etiqueta}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {u.activo ? (
                          <span className="badge badge--ok">Activo</span>
                        ) : (
                          <span className="badge badge--warn">Inactivo</span>
                        )}
                      </td>
                      <td>{fecha(u.creadoEn)}</td>
                      <td className="acciones">
                        <button
                          type="button"
                          className="linkbtn"
                          onClick={() => {
                            setAvisoOk(null);
                            setClaveUsuario(u);
                          }}
                        >
                          Contraseña
                        </button>
                        {clienteCredenciales !== undefined && (
                          <button
                            type="button"
                            className="linkbtn"
                            onClick={() => setCredencialUsuario(u)}
                          >
                            Credencial
                          </button>
                        )}
                        <button
                          type="button"
                          className={`linkbtn${u.activo ? " linkbtn--danger" : ""}`}
                          disabled={esUnoMismo && u.activo}
                          title={
                            esUnoMismo && u.activo
                              ? "No podés desactivar tu propio usuario"
                              : undefined
                          }
                          onClick={() => void alternarActivo(u)}
                        >
                          {u.activo ? "Desactivar" : "Reactivar"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {creando && (
        <ModalNuevoUsuario
          api={api}
          onCerrar={() => setCreando(false)}
          onCreado={() => {
            setCreando(false);
            void cargar();
          }}
        />
      )}

      {claveUsuario !== null && (
        <ModalContrasena
          api={api}
          usuario={claveUsuario}
          esUnoMismo={claveUsuario.id === propioId}
          onCerrar={() => setClaveUsuario(null)}
          onCambiada={(u) => {
            setClaveUsuario(null);
            setAvisoOk(`Contraseña cambiada para "${u.nombreDisplay}".`);
          }}
        />
      )}

      {credencialUsuario !== null && clienteCredenciales !== undefined && (
        <CredencialEmpleado
          usuario={credencialUsuario}
          clienteUsuarios={api}
          clienteCredenciales={clienteCredenciales}
          {...(comercio !== undefined ? { comercio } : {})}
          onCerrar={() => setCredencialUsuario(null)}
        />
      )}
    </div>
  );
}

/** Miniatura de la foto de perfil; tocarla abre el selector de archivo para cambiarla. */
function FotoCelda({
  usuarioId,
  cliente,
  onError,
}: {
  usuarioId: string;
  cliente: ClienteUsuarios;
  onError: (mensaje: string) => void;
}) {
  const [fotoDataUrl, setFotoDataUrl] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);

  // `onError` llega del padre como arrow nueva en cada render, así que NO
  // puede estar en las dependencias del efecto: cambiaría de identidad en
  // cada render y volvería a pedir la foto de todos los usuarios.
  //
  // Peor todavía, se realimentaba solo: un pedido que fallaba llamaba a
  // `onError` → el padre hacía `setError` → re-render → dependencia nueva →
  // pedir de nuevo → fallar → ... hasta que el servidor cortaba con
  // "ThrottlerException: Too Many Requests". Pasó al cambiar una foto de
  // perfil. Mismo patrón (y misma solución) que en `AccesoRemoto.tsx`.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cliente
      .obtenerFoto(usuarioId)
      .then((r) => {
        if (vivo) setFotoDataUrl(r.fotoBase64);
      })
      .catch((e: unknown) => {
        if (vivo) onErrorRef.current(mensaje(e));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [usuarioId, cliente]);

  async function elegirFoto(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivo.size > ARCHIVO_FOTO_MAX_BYTES) {
      onError(
        `El archivo no puede pesar más de ${Math.round(ARCHIVO_FOTO_MAX_BYTES / 1024 / 1024)} MB.`,
      );
      return;
    }
    setSubiendo(true);
    try {
      const dataUrl = await redimensionarImagen(archivo);
      const r = await cliente.actualizarFoto(usuarioId, dataUrl);
      setFotoDataUrl(r.fotoBase64);
    } catch (err) {
      onError(mensaje(err));
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <label className="foto-celda" title="Cambiar foto">
      {!cargando && fotoDataUrl !== null ? (
        <img src={fotoDataUrl} alt="" className="foto-celda__img" />
      ) : (
        <div className="foto-celda__placeholder" />
      )}
      <input
        type="file"
        accept="image/*"
        className="foto-celda__input"
        onChange={(e) => void elegirFoto(e)}
        disabled={subiendo}
      />
    </label>
  );
}

/**
 * Cambio de contraseña (Fase 17.E).
 *
 * Existe porque faltaba: Configuración avisa que hay contraseñas flojas antes
 * de publicar el panel en internet y manda a cambiarlas "en Usuarios" — pero
 * no había ninguna forma de cambiar una, ni acá ni en el servidor.
 *
 * La fortaleza la juzga el servidor (`evaluarFortaleza`, es el único que ve la
 * contraseña en claro). Acá solo se valida lo que evita un viaje al pedo y el
 * error de tipeo que dejaría a alguien afuera: por eso la confirmación.
 */
function ModalContrasena({
  api,
  usuario,
  esUnoMismo,
  onCerrar,
  onCambiada,
}: {
  api: ClienteUsuarios;
  usuario: UsuarioRemoto;
  esUnoMismo: boolean;
  onCerrar: () => void;
  onCambiada: (u: UsuarioRemoto) => void;
}) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const e: string[] = [];
    if (esUnoMismo && actual === "") e.push("Escribí tu contraseña actual.");
    if (nueva.length < 8) e.push("La contraseña nueva debe tener al menos 8 caracteres.");
    if (nueva !== repetida) e.push("Las dos contraseñas nuevas no coinciden.");
    if (e.length > 0) {
      setErrores(e);
      return;
    }
    const cambio: CambioPassword = {
      passwordNueva: nueva,
      ...(esUnoMismo ? { passwordActual: actual } : {}),
    };
    setGuardando(true);
    setErrores([]);
    try {
      onCambiada(await api.cambiarPassword(usuario.id, cambio));
    } catch (err) {
      setErrores([mensaje(err)]);
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Contraseña de {usuario.nombreDisplay}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {esUnoMismo ? (
            <div className="field">
              <label>Tu contraseña actual</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={actual}
                onChange={(e) => setActual(e.target.value)}
              />
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              Le vas a poner una contraseña nueva a {usuario.email}. No hace falta saber la
              anterior. Decísela y pedile que la cambie cuando entre.
            </p>
          )}
          <div className="field">
            <label>Contraseña nueva</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Repetila</label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={repetida}
              onChange={(e) => setRepetida(e.target.value)}
            />
          </div>
          <div className="config-ayuda">
            Si el panel se va a ver por internet, que tenga 12 caracteres o más y que no incluya el
            nombre del comercio ni el del usuario. Configuración avisa cuáles quedan flojas.
          </div>
          {errores.length > 0 && (
            <div className="error">
              {errores.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => void guardar()}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalNuevoUsuario({
  api,
  onCerrar,
  onCreado,
}: {
  api: ClienteUsuarios;
  onCerrar: () => void;
  onCreado: () => void;
}) {
  const [usuario, setUsuario] = useState("");
  const [nombreDisplay, setNombreDisplay] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<RolUsuario>("CAJERO");
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const e: string[] = [];
    if (usuario.trim().length < 3) e.push("El usuario debe tener al menos 3 caracteres.");
    if (nombreDisplay.trim() === "") e.push("Falta el nombre.");
    if (password.length < 8) e.push("La contraseña debe tener al menos 8 caracteres.");
    if (e.length > 0) {
      setErrores(e);
      return;
    }
    const datos: NuevoUsuario = {
      email: usuario.trim(),
      nombreDisplay: nombreDisplay.trim(),
      password,
      rol,
    };
    setGuardando(true);
    setErrores([]);
    try {
      await api.crear(datos);
      onCreado();
    } catch (err) {
      setErrores([mensaje(err)]);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Nuevo usuario</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>Nombre</label>
            <input
              className="input"
              value={nombreDisplay}
              onChange={(e) => setNombreDisplay(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Nombre de usuario</label>
            <input
              className="input"
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              placeholder="ej. deposito, oficina, cajero2"
            />
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Contraseña</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Rol</label>
              <select
                className="input"
                value={rol}
                onChange={(e) => setRol(e.target.value as RolUsuario)}
              >
                {ROLES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {errores.length > 0 && (
            <div className="error">
              {errores.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="pill-btn pill-btn--primary"
            onClick={() => void guardar()}
            disabled={guardando}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
