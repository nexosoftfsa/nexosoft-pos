import { useState } from "react";
import { useSesion } from "../auth/contexto-sesion";
import { reportes } from "../api/reportes";
import { useReporte } from "../hooks/useReporte";
import { EstadoReporteVista } from "../componentes/EstadoReporteVista";
import { descargarCsv } from "../csv";

export function Stock() {
  const { api } = useSesion();
  const [umbral, setUmbral] = useState(5);

  const bajo = useReporte(() => reportes.stockBajo(api, umbral), [umbral]);

  return (
    <section className="pagina">
      <div className="panel">
        <div className="panel__cabecera">
          <h3 className="panel__titulo">Productos con stock bajo</h3>
          <div className="panel__controles">
            <label className="campo campo--inline">
              <span>Umbral (≤)</span>
              <input
                type="number"
                min={0}
                value={umbral}
                onChange={(e) => setUmbral(Math.max(0, Number(e.target.value)))}
              />
            </label>
            <button
              className="boton boton--secundario boton--chico"
              disabled={!bajo.datos || bajo.datos.length === 0}
              onClick={() =>
                descargarCsv("stock-bajo.csv", [
                  ["Código", "Producto", "Saldo"],
                  ...(bajo.datos ?? []).map((s) => [
                    s.producto.codigo,
                    s.producto.nombre,
                    s.saldo,
                  ]),
                ])
              }
            >
              Exportar CSV
            </button>
          </div>
        </div>

        <EstadoReporteVista
          cargando={bajo.cargando}
          error={bajo.error}
          vacio={!bajo.datos || bajo.datos.length === 0}
        >
          <table className="tabla">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="tabla__num">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {bajo.datos?.map((s) => (
                <tr key={s.producto.id}>
                  <td>{s.producto.codigo}</td>
                  <td>{s.producto.nombre}</td>
                  <td className="tabla__num">{s.saldo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </EstadoReporteVista>
      </div>
    </section>
  );
}
