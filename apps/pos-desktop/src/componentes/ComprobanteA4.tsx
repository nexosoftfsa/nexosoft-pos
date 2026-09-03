/**
 * Fase 10.4: layout imprimible A4 de un comprobante. Presentacional puro
 * (mismo `DatosTicket` que ya arma la impresora térmica — ver
 * `packages/hardware/src/impresora.ts`), oculto en pantalla y mostrado solo
 * durante `window.print()` (ver `.hoja-a4` / `body.modo-impresion-a4` en
 * `estilos.css`).
 */
import type { Cantidad } from "@nexosoft/domain";
import {
  fechaHoraTicket,
  identificacionComprobanteAsociado,
  letraFiscal,
  leyendaNumeroProvisional,
  llevaDatosDelReceptor,
  numeroEsProvisional,
  numeroFiscalFormateado,
  referenciaInterna,
} from "@nexosoft/hardware";
import { pesos } from "../formato";
import type { DatosImpresion } from "./qr-fiscal-datos";
import { QrFiscal } from "./QrFiscal";

/** "1" para cantidades enteras (lo usual), "1.500" para fraccionadas (venta por peso). */
function cantidadFormateada(c: Cantidad): string {
  return c.esEntera() ? c.aDecimalString(0) : c.aDecimalString(3);
}

export function ComprobanteA4({ datos }: { datos: DatosImpresion }) {
  const esFiscal = datos.esFiscal ?? true;
  const provisional = numeroEsProvisional(datos);
  const letra = letraFiscal(datos);
  const conReceptor = llevaDatosDelReceptor(datos);

  return (
    <div className="hoja-a4">
      <header className="a4-header">
        <div className="a4-emisor">
          {datos.logoDataUrl !== undefined && (
            <img src={datos.logoDataUrl} alt="Logo" className="a4-logo" />
          )}
          <div className="a4-razon-social">{datos.razonSocial}</div>
          <div>CUIT {datos.cuit}</div>
          <div>{datos.condicionIvaEmisor}</div>
          <div>Punto de venta {String(datos.puntoDeVenta).padStart(4, "0")}</div>
        </div>
        <div className="a4-comprobante">
          {/* La letra en grande es la forma tradicional de identificar la
              factura de un vistazo (A, B, C). La C ya andaba sin este bloque,
              así que sólo se pinta cuando estamos hablando de A/B. */}
          {esFiscal && (letra === "A" || letra === "B") && (
            <div className="a4-letra" aria-hidden>
              {letra}
            </div>
          )}
          <div className="a4-tipo">{datos.tipoComprobante}</div>
          <div>{provisional ? referenciaInterna(datos) : `N° ${numeroFiscalFormateado(datos)}`}</div>
          <div>{fechaHoraTicket(datos.fecha)}</div>
          {datos.leyenda !== undefined && (
            <div className="a4-leyenda">{datos.leyenda}</div>
          )}
          {esFiscal && datos.condicionIvaReceptor !== "" && (
            <div>Receptor: {datos.condicionIvaReceptor}</div>
          )}
          {datos.comprobanteAsociado !== undefined && (
            <div>
              Comprobante asociado: {identificacionComprobanteAsociado(datos.comprobanteAsociado)}
            </div>
          )}
        </div>
      </header>

      {/* Datos del receptor. En una Factura A ARCA los exige, así que sin esto
          el papel no cumple como comprobante. En B sólo si viene un cliente
          identificado; en C nunca (ver `llevaDatosDelReceptor`). */}
      {conReceptor && datos.receptor !== undefined && (
        <section className="a4-receptor">
          <div className="a4-subtitulo">Receptor</div>
          <div className="a4-razon-social">{datos.receptor.razonSocial}</div>
          <div>CUIT/DNI: {datos.receptor.documento}</div>
          {datos.receptor.domicilio !== undefined && datos.receptor.domicilio.trim() !== "" && (
            <div>{datos.receptor.domicilio}</div>
          )}
          <div>Condición IVA: {datos.condicionIvaReceptor}</div>
        </section>
      )}

      {!esFiscal && (
        <div className="a4-aviso-no-fiscal">
          COMPROBANTE NO VÁLIDO COMO FACTURA — comercio sin alta en ARCA
        </div>
      )}

      <table className="a4-items">
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>P. Unitario</th>
            <th>Importe</th>
          </tr>
        </thead>
        <tbody>
          {datos.lineas.map((linea, i) => (
            <tr key={i}>
              <td>{linea.descripcion}</td>
              <td>{cantidadFormateada(linea.cantidad)}</td>
              <td>{pesos(linea.precioUnitario)}</td>
              <td>{pesos(linea.importe)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="a4-totales">
        {esFiscal &&
          datos.subtotalesIva.map((s, i) => (
            <div className="a4-fila-total" key={i}>
              <span>{s.etiqueta} (neto {pesos(s.base)})</span>
              <span>{pesos(s.iva)}</span>
            </div>
          ))}
        {datos.descuento.esPositivo() && (
          <div className="a4-fila-total">
            <span>Descuento</span>
            <span>-{pesos(datos.descuento)}</span>
          </div>
        )}
        <div className="a4-fila-total a4-total-final">
          <span>TOTAL</span>
          <span>{pesos(datos.total)}</span>
        </div>
      </div>

      {datos.formasDePago.length > 0 && (
        <div className="a4-pagos">
          <div className="a4-subtitulo">Forma de pago</div>
          {datos.formasDePago.map((p, i) => (
            <div className="a4-fila-total" key={i}>
              <span>{p.etiqueta}</span>
              <span>{pesos(p.monto)}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="a4-footer a4-footer--con-qr">
        {esFiscal && <QrFiscal qr={datos.qr} tamanio={90} />}
        <div>
          {esFiscal ? (
            datos.cae ? (
              <>
                CAE {datos.cae}
                {datos.vencimientoCae &&
                  ` — Vto. ${datos.vencimientoCae.toLocaleDateString("es-AR")}`}
              </>
            ) : provisional ? (
              `Pendiente de autorización de ARCA. ${leyendaNumeroProvisional(datos)}`
            ) : (
              "Pendiente de autorización de ARCA."
            )
          ) : (
            <>
              Documento interno, sin validez fiscal.
              {provisional && ` ${leyendaNumeroProvisional(datos)}`}
            </>
          )}
        </div>
      </footer>
    </div>
  );
}
