/**
 * QR fiscal de ARCA en el comprobante (RG 4892/2020).
 *
 * Desde 2021 todo comprobante electrónico tiene que llevarlo impreso:
 * cualquiera lo escanea y ARCA le confirma si el comprobante existe. Un ticket
 * sin QR está mal emitido.
 *
 * Este componente NO genera nada: pinta una imagen ya resuelta. La generación
 * vive en `qr-fiscal-datos.ts` y ocurre antes de imprimir, porque
 * `window.print()` no espera promesas — el QR se armaba tarde y el comprobante
 * salía sin él.
 */
export function QrFiscal({
  qrDataUrl,
  tamanio = 110,
}: {
  qrDataUrl: string | undefined;
  tamanio?: number;
}) {
  if (qrDataUrl === undefined) return null;

  return (
    <div className="qr-fiscal">
      <img src={qrDataUrl} alt="Código QR de ARCA" width={tamanio} height={tamanio} />
      <div className="qr-fiscal__pie">Comprobante autorizado por ARCA</div>
    </div>
  );
}
