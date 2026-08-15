import { useState, type ChangeEvent, type CSSProperties, type FormEvent } from "react";

import { CondicionIva } from "@nexosoft/domain";
import { Actualizaciones } from "./Actualizaciones";

export interface ValoresConfig {
  readonly servidorUrl: string;
  readonly razonSocial: string;
  readonly cuit: string;
  readonly condicionIvaEmisor: CondicionIva;
  readonly puntoDeVenta: number;
  /** Fase 10.1: si el comercio ya está de alta en ARCA y emite Factura A/B/C. */
  readonly emiteComprobantesFiscales: boolean;
  /** Logo del comercio como data URL. Ver `ConfiguracionComercio.logoDataUrl`. */
  readonly logoDataUrl?: string;
}

/** Tamaño máximo del archivo de logo (queda embebido en SQLite y viaja en cada impresión). */
const LOGO_MAX_BYTES = 300 * 1024;

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

const EMISORES: ReadonlyArray<{ valor: CondicionIva; etiqueta: string }> = [
  { valor: CondicionIva.ResponsableInscripto, etiqueta: "Responsable Inscripto" },
  { valor: CondicionIva.Monotributo, etiqueta: "Monotributo" },
];

/** Configuración de la terminal: servidor de sucursal + datos del comercio. */
export function PantallaConfig({
  valores,
  onGuardar,
  onCancelar,
}: {
  valores: ValoresConfig;
  onGuardar: (v: ValoresConfig) => Promise<void>;
  onCancelar: () => void;
}) {
  const [servidorUrl, setServidorUrl] = useState(valores.servidorUrl);
  const [razonSocial, setRazonSocial] = useState(valores.razonSocial);
  const [cuit, setCuit] = useState(valores.cuit);
  const [condicion, setCondicion] = useState<CondicionIva>(valores.condicionIvaEmisor);
  const [puntoDeVenta, setPuntoDeVenta] = useState(String(valores.puntoDeVenta));
  const [emiteFiscal, setEmiteFiscal] = useState(valores.emiteComprobantesFiscales);
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>(valores.logoDataUrl);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function elegirLogo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (archivo.size > LOGO_MAX_BYTES) {
      setError(`El logo no puede pesar más de ${Math.round(LOGO_MAX_BYTES / 1024)} KB.`);
      return;
    }
    try {
      setLogoDataUrl(await leerComoDataUrl(archivo));
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
        ...(logoDataUrl !== undefined ? { logoDataUrl } : {}),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setGuardando(false);
    }
  }

  return (
    <div style={fondo}>
      <form style={tarjeta} onSubmit={enviar}>
        <div style={titulo}>Configuración</div>

        <label style={etiqueta}>
          Servidor de sucursal
          <input style={campo} value={servidorUrl} onChange={(e) => setServidorUrl(e.target.value)} />
        </label>
        <label style={etiqueta}>
          Razón social
          <input style={campo} value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} />
        </label>
        <label style={etiqueta}>
          CUIT
          <input style={campo} value={cuit} onChange={(e) => setCuit(e.target.value)} />
        </label>
        <label style={etiqueta}>
          Condición frente al IVA
          <select
            style={campo}
            value={condicion}
            onChange={(e) => setCondicion(e.target.value as CondicionIva)}
          >
            {EMISORES.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label style={etiqueta}>
          Logo del comercio
          <div style={{ display: "flex", alignItems: "center", gap: "0.7rem" }}>
            {logoDataUrl !== undefined && (
              <img src={logoDataUrl} alt="Logo" style={{ height: 40, maxWidth: 120, objectFit: "contain" }} />
            )}
            <input style={{ ...campo, padding: "0.4rem" }} type="file" accept="image/*" onChange={(e) => void elegirLogo(e)} />
            {logoDataUrl !== undefined && (
              <button type="button" style={enlace} onClick={() => setLogoDataUrl(undefined)}>
                Quitar
              </button>
            )}
          </div>
        </label>
        <label style={etiqueta}>
          Punto de venta
          <input
            style={campo}
            type="number"
            min={1}
            value={puntoDeVenta}
            onChange={(e) => setPuntoDeVenta(e.target.value)}
          />
        </label>
        <label style={{ ...etiqueta, flexDirection: "row", alignItems: "center", gap: "0.5rem" }}>
          <input
            type="checkbox"
            checked={emiteFiscal}
            onChange={(e) => setEmiteFiscal(e.target.checked)}
          />
          Ya está de alta en ARCA (emite Factura A/B/C)
        </label>
        {!emiteFiscal && (
          <div style={ayuda}>
            Mientras esté desmarcado, el sistema vende con un ticket interno sin
            CAE ni numeración fiscal. Activalo cuando el comercio complete el
            alta en ARCA.
          </div>
        )}

        {error !== null && <div style={aviso}>{error}</div>}

        <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.4rem" }}>
          <button type="button" style={botonSec} onClick={onCancelar} disabled={guardando}>
            Cancelar
          </button>
          <button type="submit" style={{ ...boton, opacity: guardando ? 0.6 : 1 }} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
      <Actualizaciones />
    </div>
  );
}

const fondo: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100vh",
  background: "#f1f5f9",
  fontFamily: "system-ui, sans-serif",
};
const tarjeta: CSSProperties = {
  width: "min(420px, 92vw)",
  display: "flex",
  flexDirection: "column",
  gap: "0.75rem",
  padding: "2rem",
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 10px 30px rgba(15, 23, 42, 0.12)",
};
const titulo: CSSProperties = { fontSize: "1.3rem", fontWeight: 700, color: "#0f172a" };
const etiqueta: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "0.3rem",
  fontSize: "0.85rem",
  color: "#334155",
};
const campo: CSSProperties = {
  padding: "0.55rem 0.7rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  fontSize: "1rem",
};
const boton: CSSProperties = {
  flex: 1,
  padding: "0.7rem",
  borderRadius: "8px",
  border: "none",
  background: "#2563eb",
  color: "#fff",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const botonSec: CSSProperties = {
  flex: 1,
  padding: "0.7rem",
  borderRadius: "8px",
  border: "1px solid #cbd5e1",
  background: "#f8fafc",
  color: "#334155",
  fontSize: "1rem",
  fontWeight: 600,
  cursor: "pointer",
};
const aviso: CSSProperties = {
  background: "#fef2f2",
  color: "#b91c1c",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  fontSize: "0.85rem",
};
const ayuda: CSSProperties = {
  background: "#fffbeb",
  color: "#92400e",
  padding: "0.5rem 0.7rem",
  borderRadius: "8px",
  fontSize: "0.8rem",
};
const enlace: CSSProperties = {
  background: "none",
  border: "none",
  color: "#2563eb",
  fontSize: "0.85rem",
  cursor: "pointer",
  whiteSpace: "nowrap",
};
