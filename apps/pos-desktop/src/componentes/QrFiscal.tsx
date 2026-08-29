/**
 * QR fiscal de ARCA en el comprobante (RG 4892/2020).
 *
 * Desde 2021 todo comprobante electrónico tiene que llevarlo impreso:
 * cualquiera lo escanea y ARCA le confirma si el comprobante existe. Un ticket
 * sin QR está mal emitido.
 *
 * Se dibuja como SVG en línea y NO como `<img>`: una imagen —aunque sea un
 * data URL ya generado— tiene que decodificarse antes de pintarse, y
 * `window.print()` no espera eso. Con `<img>` el comprobante salía con el
 * recuadro del QR vacío. Un SVG es parte del DOM y se dibuja con el layout.
 *
 * La generación vive en `qr-fiscal-datos.ts`; acá sólo se pinta.
 */
import type { DatosImpresion } from "./qr-fiscal-datos";

export function QrFiscal({
  qr,
  tamanio = 110,
}: {
  qr: DatosImpresion["qr"];
  tamanio?: number;
}) {
  if (qr === undefined) return null;

  return (
    <div className="qr-fiscal">
      <svg
        className="qr-fiscal__svg"
        width={tamanio}
        height={tamanio}
        viewBox={`0 0 ${qr.lado} ${qr.lado}`}
        role="img"
        aria-label="Código QR de ARCA"
      >
        {/* El fondo blanco es parte del código: sobre otro color no se lee. */}
        <rect width={qr.lado} height={qr.lado} fill="#ffffff" />
        <path d={qr.path} fill="#000000" />
      </svg>
      <div className="qr-fiscal__pie">Comprobante autorizado por ARCA</div>
    </div>
  );
}
