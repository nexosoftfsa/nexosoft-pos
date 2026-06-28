import { useState } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { reportes, type RangoFechas } from "../api/reportes";
import { useReporte } from "../hooks/useReporte";
import { SelectorRango, rangoUltimos30 } from "../componentes/SelectorRango";
import { EstadoReporteVista } from "../componentes/EstadoReporteVista";
import { etiquetaMedioPago, formatearCantidad, formatearMoneda } from "../formato";

export function Ventas() {
  const { api } = useSesion();
  const [rango, setRango] = useState<RangoFechas>(rangoUltimos30());
  const claves = [rango.desde, rango.hasta];

  const medios = useReporte(() => reportes.porMedioPago(api, rango), claves);
  const terminales = useReporte(() => reportes.porTerminal(api, rango), claves);

  return (
    <section className="pagina">
      <SelectorRango rango={rango} onChange={setRango} />

      <div className="paneles">
        <div className="panel">
          <h3 className="panel__titulo">Por medio de pago</h3>
          <EstadoReporteVista
            cargando={medios.cargando}
            error={medios.error}
            vacio={!medios.datos || medios.datos.length === 0}
          >
            <table className="tabla">
              <thead>
                <tr>
                  <th>Medio</th>
                  <th className="tabla__num">Ventas</th>
                  <th className="tabla__num">Total</th>
                </tr>
              </thead>
              <tbody>
                {medios.datos?.map((m) => (
                  <tr key={m.medioPago}>
                    <td>{etiquetaMedioPago(m.medioPago)}</td>
                    <td className="tabla__num">{formatearCantidad(m.cantidad)}</td>
                    <td className="tabla__num">{formatearMoneda(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EstadoReporteVista>
        </div>

        <div className="panel">
          <h3 className="panel__titulo">Por terminal (caja)</h3>
          <EstadoReporteVista
            cargando={terminales.cargando}
            error={terminales.error}
            vacio={!terminales.datos || terminales.datos.length === 0}
          >
            <table className="tabla">
              <thead>
                <tr>
                  <th>Terminal</th>
                  <th className="tabla__num">Ventas</th>
                  <th className="tabla__num">Total</th>
                </tr>
              </thead>
              <tbody>
                {terminales.datos?.map((t) => (
                  <tr key={t.terminalId}>
                    <td>{t.nombre}</td>
                    <td className="tabla__num">{formatearCantidad(t.cantidad)}</td>
                    <td className="tabla__num">{formatearMoneda(t.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </EstadoReporteVista>
        </div>
      </div>
    </section>
  );
}
