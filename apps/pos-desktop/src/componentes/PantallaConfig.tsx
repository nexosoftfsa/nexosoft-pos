import { useState, type ChangeEvent, type FormEvent } from "react";

import { CondicionIva } from "@nexosoft/domain";
import { prepararLogo } from "../archivos";
import { AccesoRemoto } from "./AccesoRemoto";
import { Actualizaciones } from "./Actualizaciones";

export interface ValoresConfig {
  readonly servidorUrl: string;
  readonly razonSocial: string;
  readonly cuit: string;
  readonly condicionIvaEmisor: CondicionIva;
  readonly puntoDeVenta: number;
  /** Fase 10.1: si el comercio ya está de alta en ARCA y emite Factura A/B/C. */
  readonly emiteComprobantesFiscales: boolean;
  /** Si se permite vender sin stock suficiente (queda en negativo, ADR-0015). */
  readonly permitirStockNegativo: boolean;
  /** Logo del comercio como data URL. Ver `ConfiguracionComercio.logoDataUrl`. */
  readonly logoDataUrl?: string;
}

/**
 * Tope del archivo de ORIGEN, solo para descartar algo disparatado antes de
 * intentar procesarlo. El tamaño con el que se guarda lo resuelve
 * `prepararLogo` reescalando — mismo criterio que la foto de perfil en
 * Usuarios. Antes se rechazaba de plano cualquier logo de más de 300 KB, que
 * es lo que pasaba con cualquier archivo salido de un diseñador.
 */
const ARCHIVO_LOGO_MAX_BYTES = 20 * 1024 * 1024;

const EMISORES: ReadonlyArray<{ valor: CondicionIva; etiqueta: string }> = [
  { valor: CondicionIva.ResponsableInscripto, etiqueta: "Responsable Inscripto" },
  { valor: CondicionIva.Monotributo, etiqueta: "Monotributo" },
];

/**
 * Configuración de la terminal: servidor de sucursal + datos del comercio.
 *
 * Ocupa la pantalla completa, con las opciones agrupadas en tarjetas sobre una
 * grilla. Antes era una tarjeta de 420px en el medio de la pantalla y todo
 * caía en una sola columna: había que scrollear para llegar a Acceso remoto y
 * Actualizaciones, que quedaban abajo de todo. La grilla acomoda sola lo que
 * se vaya sumando.
 *
 * Se muestra fuera del shell (`externo` en `shell/modulos.tsx`) porque guardar
 * reconstruye el entorno, y porque también se abre desde el login — antes de
 * que exista una sesión y, por lo tanto, un shell.
 */
export function PantallaConfig({
  valores,
  onGuardar,
  onCancelar,
  obtenerToken,
}: {
  valores: ValoresConfig;
  onGuardar: (v: ValoresConfig) => Promise<void>;
  onCancelar: () => void;
  /** Token de la sesión actual, para consultar el acceso remoto (ADR-0055). */
  obtenerToken: () => string | null;
}) {
  const [servidorUrl, setServidorUrl] = useState(valores.servidorUrl);
  const [razonSocial, setRazonSocial] = useState(valores.razonSocial);
  const [cuit, setCuit] = useState(valores.cuit);
  const [condicion, setCondicion] = useState<CondicionIva>(valores.condicionIvaEmisor);
  const [puntoDeVenta, setPuntoDeVenta] = useState(String(valores.puntoDeVenta));
  const [emiteFiscal, setEmiteFiscal] = useState(valores.emiteComprobantesFiscales);
  const [stockNegativo, setStockNegativo] = useState(valores.permitirStockNegativo);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(valores.logoDataUrl);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function elegirLogo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivo.size > ARCHIVO_LOGO_MAX_BYTES) {
      setError("Ese archivo es enorme. Elegí una imagen de logo, no una foto sin recortar.");
      return;
    }
    try {
      setLogoDataUrl(await prepararLogo(archivo));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const pv = Number(puntoDeVenta);
    if (!Number.isInteger(pv) || pv <= 0) {
      setError("El punto de venta debe ser un número entero positivo.");
      return;
    }
    if (servidorUrl.trim() === "" || razonSocial.trim() === "" || cuit.trim() === "") {
      setError("Completá el servidor, la razón social y el CUIT.");
      return;
    }
    setError(null);
    setGuardando(true);
    try {
      await onGuardar({
        servidorUrl: servidorUrl.trim(),
        razonSocial: razonSocial.trim(),
        cuit: cuit.trim(),
        condicionIvaEmisor: condicion,
        puntoDeVenta: pv,
        emiteComprobantesFiscales: emiteFiscal,
        permitirStockNegativo: stockNegativo,
        ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  }

  return (
    <form className="config-pantalla" onSubmit={enviar}>
      <header className="topbar">
        <div>
          <h1>Configuración</h1>
          <div className="crumb">Comercio · Facturación · Sistema</div>
        </div>
        <div className="spacer" />
        <div className="topbar__acciones">
          <button type="button" className="pill-btn" onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" className="pill-btn pill-btn--primary" disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      <div className="gestion">
        {error !== null && <div className="error config-error">{error}</div>}

        <div className="config-grid">
          <section className="card card__pad">
            <div className="section-title">Comercio</div>
            <div className="field">
              <label htmlFor="cfg-razon">Razón social</label>
              <input
                id="cfg-razon"
                className="input"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cfg-cuit">CUIT</label>
              <input
                id="cfg-cuit"
                className="input"
                value={cuit}
                onChange={(e) => setCuit(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="cfg-logo">Logo del comercio</label>
              <div className="config-logo">
                {logoDataUrl !== undefined && <img src={logoDataUrl} alt="Logo" />}
                <input
                  id="cfg-logo"
                  className="input"
                  type="file"
                  accept="image/*"
                  onChange={(e) => void elegirLogo(e)}
                />
                {logoDataUrl !== undefined && (
                  <button type="button" className="linkbtn" onClick={() => setLogoDataUrl(undefined)}>
                    Quitar
                  </button>
                )}
              </div>
            </div>
          </section>

          <section className="card card__pad">
            <div className="section-title">Facturación</div>
            <div className="field">
              <label htmlFor="cfg-iva">Condición frente al IVA</label>
              <select
                id="cfg-iva"
                className="input"
                value={condicion}
                onChange={(e) => setCondicion(e.target.value as CondicionIva)}
              >
                {EMISORES.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="cfg-pv">Punto de venta</label>
              <input
                id="cfg-pv"
                className="input"
                type="number"
                min={1}
                value={puntoDeVenta}
                onChange={(e) => setPuntoDeVenta(e.target.value)}
              />
            </div>
            <label className="config-check">
              <input
                type="checkbox"
                checked={emiteFiscal}
                onChange={(e) => setEmiteFiscal(e.target.checked)}
              />
              Ya está de alta en ARCA (emite Factura A/B/C)
            </label>
            {!emiteFiscal && (
              <div className="config-ayuda">
                Mientras esté desmarcado, el sistema vende con un ticket interno sin CAE ni
                numeración fiscal. Activalo cuando el comercio complete el alta en ARCA.
              </div>
            )}
          </section>

          <section className="card card__pad">
            <div className="section-title">Venta y stock</div>
            <label className="config-check">
              <input
                type="checkbox"
                checked={stockNegativo}
                onChange={(e) => setStockNegativo(e.target.checked)}
              />
              Permitir vender sin stock suficiente (queda en negativo)
            </label>
            {stockNegativo && (
              <div className="config-ayuda">
                Útil si el stock de productos de mucha rotación no se actualiza a tiempo: la venta
                no se bloquea aunque figure stock cero o insuficiente, y el saldo queda en negativo
                hasta el próximo ajuste.
              </div>
            )}
          </section>

          <section className="card card__pad">
            <div className="section-title">Servidor de sucursal</div>
            <div className="field">
              <label htmlFor="cfg-servidor">Dirección del servidor</label>
              <input
                id="cfg-servidor"
                className="input"
                value={servidorUrl}
                onChange={(e) => setServidorUrl(e.target.value)}
              />
            </div>
            <div className="config-ayuda">
              En la PC que aloja el servidor va <code>http://localhost:3000/api/v1</code>. En las
              demás terminales, la IP de esa PC en la red del local.
            </div>
          </section>

          <AccesoRemoto servidorUrl={servidorUrl} obtenerToken={obtenerToken} />

          <Actualizaciones servidorUrl={servidorUrl} />
        </div>
      </div>
    </form>
  );
}
