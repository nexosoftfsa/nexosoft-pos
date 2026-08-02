/**
 * Fase 10.5: pantalla de etiquetas de góndola. Busca/filtra el catálogo,
 * permite elegir productos y cuántas copias de cada uno, e imprime una hoja
 * A4 con precio + código de barras por etiqueta (`window.print()`, mismo
 * patrón que la Fase 10.4).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { ErrorCatalogoAdmin, type ClienteCatalogoAdmin, type ProductoAdmin } from "../sync/cliente-catalogo-admin";
import { pesos } from "../formato";
import { HojaEtiquetas } from "./EtiquetaGondola";
import { armarEtiquetas, filtrarProductos, rubrosDisponibles } from "./etiquetas-gondola-helpers";
import { useImpresionEtiquetas } from "./usar-impresion-etiquetas";

function mensaje(e: unknown): string {
  if (e instanceof ErrorCatalogoAdmin) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function precio(valor: string): string {
  try {
    return pesos(Money.desde(valor));
  } catch {
    return valor;
  }
}

export function EtiquetasGondola({ cliente }: { cliente: ClienteCatalogoAdmin }) {
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState("");
  const [seleccion, setSeleccion] = useState<Map<string, number>>(new Map());
  const { etiquetas, imprimirEtiquetas } = useImpresionEtiquetas();

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    cliente
      .listarProductos(false)
      .then((ps) => {
        if (vivo) setProductos(ps);
      })
      .catch((e: unknown) => {
        if (vivo) setError(mensaje(e));
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [cliente]);

  const filtrados = useMemo(() => filtrarProductos(productos, busqueda, rubro), [productos, busqueda, rubro]);
  const rubros = useMemo(() => rubrosDisponibles(productos), [productos]);
  const totalEtiquetas = useMemo(() => [...seleccion.values()].reduce((a, n) => a + n, 0), [seleccion]);

  const alternar = useCallback((id: string) => {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      if (copia.has(id)) copia.delete(id);
      else copia.set(id, 1);
      return copia;
    });
  }, []);

  const cambiarCantidad = useCallback((id: string, delta: number) => {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      const actual = copia.get(id) ?? 0;
      const nueva = actual + delta;
      if (nueva <= 0) copia.delete(id);
      else copia.set(id, nueva);
      return copia;
    });
  }, []);

  function seleccionarFiltrados() {
    setSeleccion((prev) => {
      const copia = new Map(prev);
      for (const p of filtrados) if (!copia.has(p.id)) copia.set(p.id, 1);
      return copia;
    });
  }

  function imprimir() {
    const lista = armarEtiquetas(productos, seleccion);
    if (lista.length > 0) imprimirEtiquetas(lista);
  }

  if (cargando) return <div className="gestion">Cargando…</div>;

  return (
    <div className="gestion">
      {error !== null && <div className="error">{error}</div>}

      <div className="toolbar">
        <div className="searchbar searchbar--gestion">
          <input
            placeholder="Buscar por código, nombre o rubro…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <select value={rubro} onChange={(e) => setRubro(e.target.value)}>
          <option value="">Todos los rubros</option>
          {rubros.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button type="button" onClick={seleccionarFiltrados}>
          Seleccionar los {filtrados.length} filtrados
        </button>
        <button type="button" onClick={() => setSeleccion(new Map())} disabled={seleccion.size === 0}>
          Vaciar selección
        </button>
      </div>

      <div className="etiquetas-layout">
        <div className="card">
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Rubro</th>
                  <th className="num">Precio</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="td-vacio">
                      No hay artículos para mostrar.
                    </td>
                  </tr>
                )}
                {filtrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={seleccion.has(p.id)}
                        onChange={() => alternar(p.id)}
                      />
                    </td>
                    <td className="strong">{p.codigo}</td>
                    <td>{p.nombre}</td>
                    <td>{p.categoria?.nombre ?? "—"}</td>
                    <td className="num">{precio(p.precioVenta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card card__pad etiquetas-seleccion">
          <div className="section-title">Seleccionados ({seleccion.size})</div>
          {seleccion.size === 0 ? (
            <p className="muted">Elegí productos de la lista para armar la hoja de etiquetas.</p>
          ) : (
            <ul className="etiquetas-lista-seleccion">
              {[...seleccion.entries()].map(([id, cantidad]) => {
                const p = productos.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <li key={id}>
                    <span>{p.nombre}</span>
                    <span className="etiquetas-cantidad">
                      <button type="button" onClick={() => cambiarCantidad(id, -1)}>
                        −
                      </button>
                      {cantidad}
                      <button type="button" onClick={() => cambiarCantidad(id, 1)}>
                        +
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="primario" onClick={imprimir} disabled={totalEtiquetas === 0}>
            Imprimir {totalEtiquetas} etiqueta{totalEtiquetas === 1 ? "" : "s"}
          </button>
        </div>
      </div>

      {etiquetas && <HojaEtiquetas etiquetas={etiquetas} />}
    </div>
  );
}
