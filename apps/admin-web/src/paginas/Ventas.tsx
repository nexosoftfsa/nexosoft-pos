import { useState } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { reportes, type RangoFechas } from "../api/reportes";
import { useReporte } from "../hooks/useReporte";
import { SelectorRango, rangoUltimos30 } from "../componentes/SelectorRango";
import { EstadoReporteVista } from "../componentes/EstadoReporteVista";
import { ErrorApi } from "../api/cliente-http";
import { etiquetaMedioPago, formatearCantidad, formatearMoneda } from "../formato";
import { descargarBlob, descargarCsv } from "../csv";

export function Ventas() {
  const { api } = useSesion();
  const [rango, setRango] = useState<RangoFechas>(rangoUltimos30());
  const [errorLibro, setErrorLibro] = useState<string | null>(null);
  const claves = [rango.desde, rango.hasta];

  const medios = useReporte(() => reportes.porMedioPago(api, rango), claves);
  const terminales = useReporte(() => reportes.porTerminal(api, rango), claves);

  async function descargarLibro() {
    setErrorLibro(null);
    try {
      const blob = await reportes.libroVentas(api);
      descargarBlob("ventas.xlsx", blob);
    } catch (err) {
      setErrorLibro(
        err instanceof ErrorApi ? err.message : "No se pudo descargar el libro",
      );
    }
  }

  return (
    <section className="pagina">
      <div className="rango">
        <SelectorRango rango={rango} onChange={setRango} />
        <button className="boton boton--chico" onClick={descargarLibro}>
          Descargar libro de ventas (Excel)
        </button>
      </div>
      {errorLibro && <p className="estado estado--error">{errorLibro}</p>}

      <div className="paneles">
        <div className="panel">
          <div className="panel__cabecera">
            <h3 className="panel__titulo">Por medio de pago</h3>
            <button
              className="boton boton--secundario boton--chico"
              disabled={!medios.datos || medios.datos.length === 0}
              onClick={() =>
                descargarCsv("ventas-por-medio-pago.csv", [
                  ["Medio", "Ventas", "Total"],
                  ...(medios.datos ?? []).map((m) => [
                    etiquetaMedioPago(m.medioPago),
                    String(m.cantidad),
                    m.total,
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
          </div>
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
          <div className="panel__cabecera">
            <h3 className="panel__titulo">Por terminal (caja)</h3>
            <button
              className="boton boton--secundario boton--chico"
              disabled={!terminales.datos || terminales.datos.length === 0}
              onClick={() =>
                descargarCsv("ventas-por-terminal.csv", [
                  ["Terminal", "Ventas", "Total"],
                  ...(terminales.datos ?? []).map((t) => [
                    t.nombre,
                    String(t.cantidad),
                    t.total,
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
          </div>
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
