import { useState } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { reportes, type RangoFechas } from "../api/reportes";
import { useReporte } from "../hooks/useReporte";
import { SelectorRango, rangoUltimos30 } from "../componentes/SelectorRango";
import { EstadoReporteVista } from "../componentes/EstadoReporteVista";
import { formatearMoneda } from "../formato";
import { descargarCsv } from "../csv";

const OPCIONES_LIMITE = [10, 20, 50] as const;

export function Productos() {
  const { api } = useSesion();
  const [rango, setRango] = useState<RangoFechas>(rangoUltimos30());
  const [limite, setLimite] = useState(10);

  const top = useReporte(
    () => reportes.topProductos(api, rango, limite),
    [rango.desde, rango.hasta, limite],
  );

  return (
    <section className="pagina">
      <SelectorRango rango={rango} onChange={setRango} />

      <div className="panel">
        <div className="panel__cabecera">
          <h3 className="panel__titulo">Productos más vendidos</h3>
          <div className="panel__controles">
            <label className="campo campo--inline">
              <span>Mostrar</span>
              <select
                value={limite}
                onChange={(e) => setLimite(Number(e.target.value))}
              >
                {OPCIONES_LIMITE.map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="boton boton--secundario boton--chico"
              disabled={!top.datos || top.datos.length === 0}
              onClick={() =>
                descargarCsv("productos-top.csv", [
                  ["#", "Código", "Producto", "Cantidad", "Monto"],
                  ...(top.datos ?? []).map((p, i) => [
                    String(i + 1),
                    p.codigo,
                    p.nombre,
                    p.cantidad,
                    p.monto,
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <EstadoReporteVista
          cargando={top.cargando}
          error={top.error}
          vacio={!top.datos || top.datos.length === 0}
        >
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th>Código</th>
                <th>Producto</th>
                <th className="tabla__num">Cantidad</th>
                <th className="tabla__num">Monto</th>
              </tr>
            </thead>
            <tbody>
              {top.datos?.map((p, i) => (
                <tr key={p.productoId}>
                  <td>{i + 1}</td>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td className="tabla__num">{p.cantidad}</td>
                  <td className="tabla__num">{formatearMoneda(p.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoReporteVista>
      </div>
    </section>
  );
}
