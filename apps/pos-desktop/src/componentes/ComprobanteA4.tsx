/**
 * Fase 10.4: layout imprimible A4 de un comprobante. Presentacional puro
 * (mismo `DatosTicket` que ya arma la impresora térmica — ver
 * `packages/hardware/src/impresora.ts`), oculto en pantalla y mostrado solo
 * durante `window.print()` (ver `.hoja-a4` / `body.modo-impresion-a4` en
 * `estilos.css`).
 */
import type { Cantidad } from "@nexosoft/domain";
import {
  ACLARACION_IMPUESTOS_NACIONALES,
  fechaHoraTicket,
  identificacionComprobanteAsociado,
  importeImpreso,
  letraFiscal,
  LEYENDA_TRANSPARENCIA_FISCAL,
  lineasSinIva,
  precioUnitarioImpreso,
  leyendaNumeroProvisional,
  llevaDatosDelReceptor,
  montoDelSubtotal,
  numeroEsProvisional,
  numeroFiscalFormateado,
  referenciaInterna,
  subtotalNeto,
  transparenciaFiscal,
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
  const neto = subtotalNeto(datos);
  const transparencia = transparenciaFiscal(datos);
  const sinIva = lineasSinIva(datos);

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

      {/* En una Factura A las columnas van SIN IVA —la norma pide precios
          unitarios netos de impuestos— y se dice en el encabezado para que no
          haya que deducirlo. En la B y la C va el precio final. */}
      <table className="a4-items">
        <thead>
          <tr>
            <th>Descripción</th>
            <th>Cantidad</th>
            <th>{sinIva ? "P. Unitario neto" : "P. Unitario"}</th>
            <th>{sinIva ? "Importe neto" : "Importe"}</th>
          </tr>
        </thead>
        <tbody>
          {datos.lineas.map((linea, i) => (
            <tr key={i}>
              <td>{linea.descripcion}</td>
              <td>{cantidadFormateada(linea.cantidad)}</td>
              <td>{pesos(precioUnitarioImpreso(datos, linea))}</td>
              <td>{pesos(importeImpreso(datos, linea))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="a4-totales">
        {/* Sólo la Factura A discrimina. La misma regla que la térmica y el
            ticket, en un solo lugar (`subtotalNeto`). */}
        {neto !== null && (
          <div className="a4-fila-total">
            <span>Subtotal neto</span>
            <span>{pesos(neto)}</span>
          </div>
        )}
        {neto !== null &&
          datos.subtotalesIva.map((s, i) => (
            <div className="a4-fila-total" key={i}>
              {/* Un exento no tiene "neto gravado" que aclarar: su importe ES
                  la base, y se muestra sola. */}
              <span>
                {s.etiqueta}
                {s.esExento === true ? "" : ` (neto ${pesos(s.base)})`}
              </span>
              <span>{pesos(montoDelSubtotal(s))}</span>
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
          {/* El vuelto lo imprimían la térmica y el ticket en pantalla, y el A4
              no. Sin él, una venta de $ 9.258,86 pagada con $ 10.000 muestra
              "Efectivo $ 10.000,00" contra un total menor y nada que lo
              explique: parece un comprobante mal sumado. */}
          {datos.vuelto.esPositivo() && (
            <div className="a4-fila-total">
              <span>Vuelto</span>
              <span>-{pesos(datos.vuelto)}</span>
            </div>
          )}
        </div>
      )}

      {/* Régimen de Transparencia Fiscal: obligatorio en toda Factura B desde
          el 1/4/2025. Acá hay lugar, así que el renglón lleva el nombre
          completo que usa la norma; en la térmica va abreviado. */}
      {transparencia !== null && (
        <div className="a4-transparencia">
          <div className="a4-subtitulo">{LEYENDA_TRANSPARENCIA_FISCAL}</div>
          <div className="a4-fila-total">
            <span>IVA Contenido</span>
            <span>{pesos(transparencia.ivaContenido)}</span>
          </div>
          <div className="a4-fila-total">
            <span>Otros Impuestos Nacionales Indirectos</span>
            <span>{pesos(transparencia.otrosImpuestosNacionales)}</span>
          </div>
          <div className="a4-nota">{ACLARACION_IMPUESTOS_NACIONALES}</div>
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
