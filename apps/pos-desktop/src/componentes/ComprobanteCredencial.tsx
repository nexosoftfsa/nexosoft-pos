/**
 * Vista previa/impresión de la credencial física de empleado (8x5cm, Fase
 * 15.A): foto + nombre + rol + código de barras (Code128) con el token de
 * acceso. Oculta salvo durante `window.print()` (`.hoja-credencial` /
 * `body.modo-impresion-credencial` en `estilos.css`, mismo patrón que
 * `.hoja-ticket`/`.hoja-a4`).
 */
import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

import type { DatosCredencial } from "./usar-impresion-credencial";

const ETIQUETA_ROL: Record<string, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
};

export function ComprobanteCredencial({ datos }: { datos: DatosCredencial }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current === null) return;
    JsBarcode(svgRef.current, datos.payloadBarcode, {
      format: "CODE128",
      displayValue: false,
      margin: 0,
      height: 45,
    });
  }, [datos.payloadBarcode]);

  return (
    <div className="hoja-credencial">
      {datos.fotoDataUrl !== undefined ? (
        <img src={datos.fotoDataUrl} alt="Foto" className="credencial-foto" />
      ) : (
        <div className="credencial-foto-placeholder" />
      )}
      <div className="credencial-datos">
        <div className="credencial-marca">NexoSoft POS</div>
        <div className="credencial-nombre">{datos.nombreDisplay}</div>
        <div className="credencial-rol">{ETIQUETA_ROL[datos.rol] ?? datos.rol}</div>
        <svg ref={svgRef} className="credencial-barcode" />
      </div>
    </div>
  );
}
