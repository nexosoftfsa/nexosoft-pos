/**
 * Vista previa/impresión del ticket chico (formato rollo térmico, ~80mm).
 * Mismo `DatosTicket` que la impresora térmica real usará el día que haya un
 * driver (hoy es mock, ver `packages/hardware`) — este template sirve para
 * ver en pantalla/papel común cómo va a quedar, oculto salvo durante
 * `window.print()` (`.hoja-ticket` / `body.modo-impresion-ticket` en
 * `estilos.css`, mismo patrón que `.hoja-a4`).
 */
import type { Cantidad } from "@nexosoft/domain";
import {
  ACLARACION_IMPUESTOS_NACIONALES,
  fechaHoraTicket,
  identificacionComprobanteAsociado,
  LEYENDA_TRANSPARENCIA_FISCAL,
  leyendaNumeroProvisional,
  llevaDatosDelReceptor,
  montoDelSubtotal,
  numeroEsProvisional,
  numeroFiscalFormateado,
  referenciaInterna,
  subtotalNeto,
  transparenciaFiscal,
} from "@nexosoft/hardware";
import type { DatosImpresion } from "./qr-fiscal-datos";
import { pesos } from "../formato";
import { QrFiscal } from "./QrFiscal";

function cantidadFormateada(c: Cantidad): string {
  return c.esEntera() ? c.aDecimalString(0) : c.aDecimalString(3);
}

export function ComprobanteTicket({ datos }: { datos: DatosImpresion }) {
  const esFiscal = datos.esFiscal ?? true;
  const provisional = numeroEsProvisional(datos);
  const conReceptor = llevaDatosDelReceptor(datos);
  // `null` salvo en Factura A con desglose: la misma regla que usa la térmica.
  const neto = subtotalNeto(datos);
  // `null` salvo en Factura B con desglose. Misma regla, mismo lugar.
  const transparencia = transparenciaFiscal(datos);

  return (
    <div className="hoja-ticket">
      {datos.logoDataUrl !== undefined && (
        <img src={datos.logoDataUrl} alt="Logo" className="ticket-print-logo" />
      )}
      <div className="ticket-print-centro">{datos.razonSocial}</div>
      <div className="ticket-print-centro">CUIT {datos.cuit}</div>
      <div className="ticket-print-centro">{datos.condicionIvaEmisor}</div>
      <div className="ticket-print-centro">PV {String(datos.puntoDeVenta).padStart(4, "0")}</div>

      <div className="ticket-print-sep" />

      <div className="ticket-print-centro ticket-print-tipo">{datos.tipoComprobante}</div>
      <div className="ticket-print-centro">
        {provisional ? referenciaInterna(datos) : `N° ${numeroFiscalFormateado(datos)}`}
      </div>
      <div className="ticket-print-centro">{fechaHoraTicket(datos.fecha)}</div>
      {datos.leyenda !== undefined && (
        <div className="ticket-print-centro ticket-print-leyenda">{datos.leyenda}</div>
      )}
      {datos.comprobanteAsociado !== undefined && (
        <div className="ticket-print-centro">
          Comprobante asociado
          <br />
          {identificacionComprobanteAsociado(datos.comprobanteAsociado)}
        </div>
      )}
      {!esFiscal && (
        <div className="ticket-print-centro ticket-print-aviso">
          NO VÁLIDO COMO FACTURA
        </div>
      )}

      {/* Receptor. Sólo A (siempre) o B con cliente identificado, nunca en C
          — ver `llevaDatosDelReceptor`. Va antes de los ítems para que aparezca
          arriba del papel, como en el estilo tradicional del A. */}
      {conReceptor && datos.receptor !== undefined && (
        <>
          <div className="ticket-print-sep" />
          <div>{datos.receptor.razonSocial}</div>
          <div>CUIT/DNI: {datos.receptor.documento}</div>
          {datos.receptor.domicilio !== undefined && datos.receptor.domicilio.trim() !== "" && (
            <div>{datos.receptor.domicilio}</div>
          )}
          <div>IVA: {datos.condicionIvaReceptor}</div>
        </>
      )}

      <div className="ticket-print-sep" />

      {datos.lineas.map((linea, i) => (
        <div className="ticket-print-linea" key={i}>
          <div>{linea.descripcion}</div>
          <div className="ticket-print-fila">
            <span>
              {cantidadFormateada(linea.cantidad)} x {pesos(linea.precioUnitario)}
            </span>
            <span>{pesos(linea.importe)}</span>
          </div>
        </div>
      ))}

      <div className="ticket-print-sep" />

      {datos.descuento.esPositivo() && (
        <div className="ticket-print-fila">
          <span>Descuento</span>
          <span>-{pesos(datos.descuento)}</span>
        </div>
      )}
      {/* En Factura A el papel muestra neto e IVA por separado; el B y el C lo
          llevan incluido en cada línea. Sin esto un contador no puede armar el
          asiento de una A. */}
      {neto !== null && (
        <div className="ticket-print-fila">
          <span>Subtotal neto</span>
          <span>{pesos(neto)}</span>
        </div>
      )}
      {neto !== null &&
        datos.subtotalesIva.map((s, i) => (
          <div className="ticket-print-fila" key={`iva-${i}`}>
            <span>{s.etiqueta}</span>
            {/* De un exento se muestra la base: su IVA es cero por definición. */}
            <span>{pesos(montoDelSubtotal(s))}</span>
          </div>
        ))}
      <div className="ticket-print-fila ticket-print-total">
        <span>TOTAL</span>
        <span>{pesos(datos.total)}</span>
      </div>

      {datos.formasDePago.length > 0 && (
        <>
          <div className="ticket-print-sep" />
          {datos.formasDePago.map((p, i) => (
            <div className="ticket-print-fila" key={i}>
              <span>{p.etiqueta}</span>
              <span>{pesos(p.monto)}</span>
            </div>
          ))}
        </>
      )}
      {datos.vuelto.esPositivo() && (
        <div className="ticket-print-fila">
          <span>Vuelto</span>
          <span>{pesos(datos.vuelto)}</span>
        </div>
      )}

      {/* Régimen de Transparencia Fiscal: obligatorio en toda Factura B desde
          el 1/4/2025. Va después del cobro y antes del CAE, como en los
          tickets que ya cumplen. */}
      {transparencia !== null && (
        <>
          <div className="ticket-print-sep" />
          <div className="ticket-print-centro">{LEYENDA_TRANSPARENCIA_FISCAL}</div>
          <div className="ticket-print-fila">
            <span>IVA contenido</span>
            <span>{pesos(transparencia.ivaContenido)}</span>
          </div>
          {/* "Imp. internos", como en la térmica y como en los tickets de
              supermercado: el nombre completo de la norma no entra en un rollo
              de 58mm. Con el largo, la fila partía el importe al medio y salía
              el "$" en un renglón y "0,00" en el otro. */}
          <div className="ticket-print-fila">
            <span>Imp. internos</span>
            <span>{pesos(transparencia.otrosImpuestosNacionales)}</span>
          </div>
          <div className="ticket-print-nota">{ACLARACION_IMPUESTOS_NACIONALES}</div>
        </>
      )}

      <div className="ticket-print-sep" />

      <div className="ticket-print-centro">
        {esFiscal
          ? datos.cae
            ? `CAE ${datos.cae}`
            : "Pendiente de autorización de ARCA"
          : "Documento interno, sin validez fiscal"}
      </div>
      {provisional && (
        <div className="ticket-print-centro ticket-print-aviso">
          {leyendaNumeroProvisional(datos)}
        </div>
      )}

      {esFiscal && <QrFiscal qr={datos.qr} tamanio={110} />}
    </div>
  );
}
