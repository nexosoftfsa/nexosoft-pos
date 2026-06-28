import { useState } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { reportes, type RangoFechas } from "../api/reportes";
import { useReporte } from "../hooks/useReporte";
import { SelectorRango, rangoUltimos30 } from "../componentes/SelectorRango";
import { TarjetaKpi } from "../componentes/TarjetaKpi";
import { GraficoSerie } from "../componentes/GraficoSerie";
import { GraficoMedioPago } from "../componentes/GraficoMedioPago";
import { EstadoReporteVista } from "../componentes/EstadoReporteVista";
import { formatearCantidad, formatearMoneda } from "../formato";

export function Resumen() {
  const { api } = useSesion();
  const [rango, setRango] = useState<RangoFechas>(rangoUltimos30());
  const claves = [rango.desde, rango.hasta];

  const resumen = useReporte(() => reportes.resumenVentas(api, rango), claves);
  const serie = useReporte(() => reportes.serieDiaria(api, rango), claves);
  const medios = useReporte(() => reportes.porMedioPago(api, rango), claves);

  return (
    <section className="pagina">
      <SelectorRango rango={rango} onChange={setRango} />

      <div className="kpis">
        <EstadoReporteVista cargando={resumen.cargando} error={resumen.error} vacio={false}>
          {resumen.datos && (
            <>
              <TarjetaKpi
                etiqueta="Total vendido"
                valor={formatearMoneda(resumen.datos.totalVendido)}
              />
              <TarjetaKpi
                etiqueta="Ventas"
                valor={formatearCantidad(resumen.datos.cantidadVentas)}
              />
              <TarjetaKpi
                etiqueta="Ticket promedio"
                valor={formatearMoneda(resumen.datos.ticketPromedio)}
              />
              <TarjetaKpi
                etiqueta="Descuentos"
                valor={formatearMoneda(resumen.datos.totalDescuentos)}
              />
            </>
          )}
        </EstadoReporteVista>
      </div>

      <div className="paneles">
        <div className="panel">
          <h3 className="panel__titulo">Ventas por día</h3>
          <EstadoReporteVista
            cargando={serie.cargando}
            error={serie.error}
            vacio={!serie.datos || serie.datos.length === 0}
          >
            {serie.datos && <GraficoSerie datos={serie.datos} />}
          </EstadoReporteVista>
        </div>

        <div className="panel">
          <h3 className="panel__titulo">Medios de pago</h3>
          <EstadoReporteVista
            cargando={medios.cargando}
            error={medios.error}
            vacio={!medios.datos || medios.datos.length === 0}
          >
            {medios.datos && <GraficoMedioPago datos={medios.datos} />}
          </EstadoReporteVista>
        </div>
      </div>
    </section>
  );
}
