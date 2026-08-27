/**
 * QR fiscal de ARCA en el comprobante (RG 4892/2020).
 *
 * Desde 2021 todo comprobante electrónico tiene que llevarlo impreso:
 * cualquiera lo escanea y ARCA le confirma si el comprobante existe. Un ticket
 * sin QR está mal emitido.
 *
 * Sólo se dibuja si hay CAE y código de comprobante. Un ticket interno, o uno
 * que todavía espera la autorización de ARCA, NO lleva QR — imprimir uno vacío
 * o inventado sería peor que no imprimirlo.
 */
import { useEffect, useState } from "react";

import { llevaQrFiscal, urlQrArca } from "@nexosoft/domain";
import type { DatosTicket } from "@nexosoft/hardware";

export function QrFiscal({ datos, tamanio = 110 }: { datos: DatosTicket; tamanio?: number }) {
  const [imagen, setImagen] = useState<string | null>(null);

  const puedeDibujarse =
    llevaQrFiscal(datos.cae) && typeof datos.codigoComprobanteArca === "number";

  useEffect(() => {
    if (!puedeDibujarse) {
      setImagen(null);
      return;
    }
    let vivo = true;
    const url = urlQrArca({
      fecha: datos.fecha,
      cuit: datos.cuit,
      puntoDeVenta: datos.puntoDeVenta,
      tipoComprobante: datos.codigoComprobanteArca as number,
      numeroComprobante: datos.numero,
      importe: datos.total.aDecimalString(2),
      cae: datos.cae as string,
    });
    // `qrcode` se carga sólo cuando hace falta: no encarece el arranque del
    // POS, que es lo primero que ve el cajero a la mañana.
    void import("qrcode")
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(url, { width: tamanio * 2, margin: 0, errorCorrectionLevel: "M" }),
      )
      .then((d) => vivo && setImagen(d))
      .catch(() => vivo && setImagen(null));
    return () => {
      vivo = false;
    };
  }, [datos, tamanio, puedeDibujarse]);

  if (!puedeDibujarse || imagen === null) return null;

  return (
    <div className="qr-fiscal">
      <img src={imagen} alt="Código QR de ARCA" width={tamanio} height={tamanio} />
      <div className="qr-fiscal__pie">Comprobante autorizado por ARCA</div>
    </div>
  );
}
