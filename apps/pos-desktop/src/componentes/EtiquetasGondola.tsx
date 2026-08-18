/**
 * Fase 10.5 (Fase 12: modo escaneo + export a Excel). Pantalla de etiquetas de
 * góndola con dos formas de armar la selección: buscar/tildar en el catálogo,
 * o escanear productos con el lector inalámbrico (más rápido para recorrer la
 * góndola). Exporta un .xlsx ya acomodado para imprimir — sin código de
 * barras, solo nombre (chico) y precio (grande).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";
import type { LectorDeBarras } from "@nexosoft/hardware";

import { ErrorCatalogoAdmin, type ClienteCatalogoAdmin, type ProductoAdmin } from "../sync/cliente-catalogo-admin";
import { pesos } from "../formato";
import { descargarBlob } from "../descargas";
import { armarEtiquetas, filtrarProductos, rubrosDisponibles } from "./etiquetas-gondola-helpers";
import { generarExcelEtiquetas } from "./etiquetas-excel";
import { useLectorTeclado } from "./usar-lector-teclado";

type ModoSeleccion = "buscar" | "escanear";

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

export function EtiquetasGondola({
  cliente,
  lector,
}: {
  cliente: ClienteCatalogoAdmin;
  lector: LectorDeBarras;
}) {
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [rubro, setRubro] = useState("");
  const [seleccion, setSeleccion] = useState<Map<string, number>>(new Map());
  const [modo, setModo] = useState<ModoSeleccion>("buscar");
  const [ultimoEscaneo, setUltimoEscaneo] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [exportando, setExportando] = useState(false);

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

  const escanear = useCallback(
    (codigo: string) => {
      const p = productos.find((x) => x.codigo === codigo);
      if (p === undefined) {
        setUltimoEscaneo({ ok: false, mensaje: `Código no encontrado: ${codigo}` });
        return;
      }
      cambiarCantidad(p.id, 1);
      setUltimoEscaneo({ ok: true, mensaje: `${p.nombre} — agregado` });
    },
    [productos, cambiarCantidad],
  );
  useLectorTeclado(lector, escanear, modo === "escanear");

  async function exportar() {
    const lista = armarEtiquetas(productos, seleccion);
    if (lista.length === 0) return;
    setExportando(true);
    setError(null);
    try {
      const blob = await generarExcelEtiquetas(lista);
      await descargarBlob("etiquetas-gondola.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setExportando(false);
    }
  }

  if (cargando) return <div className="gestion">Cargando…</div>;

  return (
    <div className="gestion">
      {error !== null && <div className="error">{error}</div>}

      <div className="toolbar">
        <span className="seg">
          <button type="button" className={modo === "buscar" ? "on" : ""} onClick={() => setModo("buscar")}>
            Buscar
          </button>
          <button
            type="button"
            className={modo === "escanear" ? "on" : ""}
            onClick={() => {
              setModo("escanear");
              setUltimoEscaneo(null);
            }}
          >
            Escanear
          </button>
        </span>
        {modo === "buscar" && (
          <>
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
          </>
        )}
        <div className="spacer" />
        {modo === "buscar" && (
          <button type="button" onClick={seleccionarFiltrados}>
            Seleccionar los {filtrados.length} filtrados
          </button>
        )}
        <button type="button" onClick={() => setSeleccion(new Map())} disabled={seleccion.size === 0}>
          Vaciar selección
        </button>
      </div>

      <div className="etiquetas-layout">
        {modo === "buscar" ? (
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
        ) : (
          <div className="card card__pad etiquetas-escaneo">
            <div className="section-title">Escaneá los productos con el lector</div>
            <p className="muted">
              Cada producto escaneado se suma a la lista de la derecha. Volvé a escanear el
              mismo producto para sumar otra copia de su etiqueta.
            </p>
            {ultimoEscaneo !== null && (
              <div className={ultimoEscaneo.ok ? "aviso-ok" : "error"}>{ultimoEscaneo.mensaje}</div>
            )}
          </div>
        )}

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
          <button
            type="button"
            className="primario"
            onClick={exportar}
            disabled={totalEtiquetas === 0 || exportando}
          >
            {exportando
              ? "Exportando…"
              : `Exportar ${totalEtiquetas} etiqueta${totalEtiquetas === 1 ? "" : "s"} a Excel`}
          </button>
        </div>
      </div>
    </div>
  );
}
