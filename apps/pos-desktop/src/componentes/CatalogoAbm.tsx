/**
 * Pantalla de ABM de catálogo (Fase 7.2): lista de productos del servidor de
 * sucursal con alta, edición y baja (desactivación). Es **online**: opera contra
 * el cloud-api (adaptador HTTP en Tauri, simulado en el navegador de desarrollo).
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorCatalogoAdmin,
  type CategoriaAdmin,
  type ClienteCatalogoAdmin,
  type ProductoAdmin,
} from "../sync/cliente-catalogo-admin";
import { pesos } from "../formato";
import {
  aDatosProducto,
  etiquetaIva,
  FORM_VACIO,
  formDesdeProducto,
  margenUtilidad,
  TIPOS_IVA,
  validarProducto,
  type FormProducto,
} from "./catalogo-form";
import { ThOrdenable, useOrdenTabla, type ValorColumna } from "./usar-orden-tabla";

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

export function CatalogoAbm({ cliente }: { cliente: ClienteCatalogoAdmin }) {
  const [productos, setProductos] = useState<ProductoAdmin[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAdmin[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [editando, setEditando] = useState<ProductoAdmin | "nuevo" | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ps, cs] = await Promise.all([
        cliente.listarProductos(incluirInactivos),
        cliente.listarCategorias(),
      ]);
      setProductos(ps);
      setCategorias(cs);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [cliente, incluirInactivos]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (q === "") return productos;
    return productos.filter((p) =>
      [p.codigo, p.nombre, p.categoria?.nombre ?? ""].some((campo) =>
        campo.toLowerCase().includes(q),
      ),
    );
  }, [productos, busqueda]);

  const columnasOrden: Record<string, ValorColumna<ProductoAdmin>> = {
    codigo: (p) => p.codigo,
    descripcion: (p) => p.nombre,
    rubro: (p) => p.categoria?.nombre ?? "",
    costo: (p) => Number(p.precioCosto),
    precio: (p) => Number(p.precioVenta),
    utilidad: (p) => margenUtilidad(p.precioVenta, p.precioCosto) ?? -Infinity,
    estado: (p) => (p.activo ? 1 : 0),
  };
  const { filasOrdenadas: ordenados, clave: claveOrden, direccion, alternar } = useOrdenTabla(
    filtrados,
    columnasOrden,
  );

  async function desactivar(p: ProductoAdmin) {
    if (!window.confirm(`¿Desactivar "${p.nombre}"? No se borra: deja de venderse y se puede reactivar.`)) {
      return;
    }
    try {
      await cliente.desactivarProducto(p.id);
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function reactivar(p: ProductoAdmin) {
    try {
      await cliente.actualizarProducto(p.id, { activo: true });
      await cargar();
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportarArticulos() {
    try {
      const todos = await cliente.listarProductos(true);
      const blob = await exportarExcel([
        {
          nombre: "Artículos",
          columnas: [
            { titulo: "Código" },
            { titulo: "Descripción", ancho: 30 },
            { titulo: "Rubro", ancho: 20 },
            { titulo: "Costo" },
            { titulo: "Precio" },
            { titulo: "IVA" },
            { titulo: "Utilidad %" },
            { titulo: "Estado" },
          ],
          filas: todos.map((p) => {
            const margen = margenUtilidad(p.precioVenta, p.precioCosto);
            return [
              p.codigo,
              p.nombre,
              p.categoria?.nombre ?? "",
              precio(p.precioCosto),
              precio(p.precioVenta),
              etiquetaIva(p.tipoIva),
              margen === null ? "" : `${margen.toFixed(0)}%`,
              p.activo ? "Activo" : "Inactivo",
            ];
          }),
        },
      ]);
      descargarBlob("articulos.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  async function exportarRubros() {
    try {
      const blob = await exportarExcel([
        { nombre: "Rubros", columnas: [{ titulo: "Rubro", ancho: 30 }], filas: categorias.map((c) => [c.nombre]) },
      ]);
      descargarBlob("rubros.xlsx", blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <div className="searchbar searchbar--gestion">
          <input
            placeholder="Buscar por código, descripción o rubro…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />
          Mostrar inactivos
        </label>
        <div className="spacer" />
        <button type="button" className="pill-btn" onClick={() => void exportarRubros()}>
          Exportar rubros
        </button>
        <button type="button" className="pill-btn" onClick={() => void exportarArticulos()}>
          Exportar artículos
        </button>
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setEditando("nuevo")}>
          + Nuevo artículo
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <ThOrdenable titulo="Código" columnaClave="codigo" claveActiva={claveOrden} direccion={direccion} alternar={alternar} />
                <ThOrdenable titulo="Descripción" columnaClave="descripcion" claveActiva={claveOrden} direccion={direccion} alternar={alternar} />
                <ThOrdenable titulo="Rubro" columnaClave="rubro" claveActiva={claveOrden} direccion={direccion} alternar={alternar} />
                <ThOrdenable titulo="Costo" columnaClave="costo" claveActiva={claveOrden} direccion={direccion} alternar={alternar} className="num" />
                <ThOrdenable titulo="Precio" columnaClave="precio" claveActiva={claveOrden} direccion={direccion} alternar={alternar} className="num" />
                <th>IVA</th>
                <ThOrdenable titulo="Utilidad" columnaClave="utilidad" claveActiva={claveOrden} direccion={direccion} alternar={alternar} className="num" />
                <ThOrdenable titulo="Estado" columnaClave="estado" claveActiva={claveOrden} direccion={direccion} alternar={alternar} />
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={9} className="td-vacio">
                    Cargando catálogo…
                  </td>
                </tr>
              )}
              {!cargando && ordenados.length === 0 && (
                <tr>
                  <td colSpan={9} className="td-vacio">
                    No hay artículos para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                ordenados.map((p) => {
                  const margen = margenUtilidad(p.precioVenta, p.precioCosto);
                  return (
                    <tr key={p.id} className={p.activo ? "" : "fila-inactiva"}>
                      <td className="strong">{p.codigo}</td>
                      <td>
                        {p.nombre}
                        {p.tipo === "COMBO" && <span className="badge badge--combo">Combo</span>}
                      </td>
                      <td>{p.categoria?.nombre ?? <span className="muted">—</span>}</td>
                      <td className="num">{precio(p.precioCosto)}</td>
                      <td className="num strong">{precio(p.precioVenta)}</td>
                      <td>{etiquetaIva(p.tipoIva)}</td>
                      <td className="num">{margen === null ? "—" : `${margen.toFixed(0)}%`}</td>
                      <td>
                        {p.activo ? (
                          <span className="badge badge--ok">Activo</span>
                        ) : (
                          <span className="badge badge--n">Inactivo</span>
                        )}
                      </td>
                      <td className="acciones">
                        <button type="button" className="linkbtn" onClick={() => setEditando(p)}>
                          Editar
                        </button>
                        {p.activo ? (
                          <button type="button" className="linkbtn linkbtn--danger" onClick={() => void desactivar(p)}>
                            Desactivar
                          </button>
                        ) : (
                          <button type="button" className="linkbtn" onClick={() => void reactivar(p)}>
                            Reactivar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {editando !== null && (
        <ModalProducto
          cliente={cliente}
          categorias={categorias}
          productos={productos}
          producto={editando === "nuevo" ? null : editando}
          onCerrar={() => setEditando(null)}
          onGuardado={() => {
            setEditando(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function ModalProducto({
  cliente,
  categorias,
  productos,
  producto,
  onCerrar,
  onGuardado,
}: {
  cliente: ClienteCatalogoAdmin;
  categorias: readonly CategoriaAdmin[];
  productos: readonly ProductoAdmin[];
  producto: ProductoAdmin | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormProducto>(() =>
    producto === null ? FORM_VACIO : formDesdeProducto(producto),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function campo<K extends keyof FormProducto>(clave: K, valor: FormProducto[K]) {
    setForm((f) => ({ ...f, [clave]: valor }));
  }

  // Productos elegibles como componentes: simples, activos y distinto del combo actual.
  const simplesDisponibles = useMemo(
    () => productos.filter((p) => p.tipo === "SIMPLE" && p.activo && p.id !== producto?.id),
    [productos, producto],
  );

  async function guardar() {
    const erroresForm = validarProducto(form);
    if (erroresForm.length > 0) {
      setErrores(erroresForm);
      return;
    }
    setGuardando(true);
    setErrores([]);
    try {
      const datos = aDatosProducto(form);
      if (producto === null) {
        await cliente.crearProducto(datos);
      } else {
        // Ni el código ni el tipo se editan (el tipo no es campo del PATCH); se
        // manda el resto (incluye `componentes` para reemplazar el set del combo).
        const { codigo: _codigo, tipo: _tipo, ...cambios } = datos;
        void _codigo;
        void _tipo;
        await cliente.actualizarProducto(producto.id, cambios);
      }
      onGuardado();
    } catch (e) {
      setErrores([mensaje(e)]);
    } finally {
      setGuardando(false);
    }
  }

  const esNuevo = producto === null;
  const esCombo = form.tipo === "COMBO";

  function agregarComponente() {
    setForm((f) => ({
      ...f,
      componentes: [...f.componentes, { componenteId: "", cantidad: "1" }],
    }));
  }
  function cambiarComponente(indice: number, patch: Partial<{ componenteId: string; cantidad: string }>) {
    setForm((f) => ({
      ...f,
      componentes: f.componentes.map((c, i) => (i === indice ? { ...c, ...patch } : c)),
    }));
  }
  function quitarComponente(indice: number) {
    setForm((f) => ({ ...f, componentes: f.componentes.filter((_, i) => i !== indice) }));
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{esNuevo ? "Nuevo artículo" : `Editar — ${producto.nombre}`}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>Tipo</label>
            <select
              className="input"
              value={form.tipo}
              disabled={!esNuevo}
              onChange={(e) => campo("tipo", e.target.value as FormProducto["tipo"])}
            >
              <option value="SIMPLE">Producto simple</option>
              <option value="COMBO">Combo (agrupa otros productos)</option>
            </select>
          </div>
          <div className="field">
            <label>Código (de barras o interno)</label>
            <input
              className="input"
              value={form.codigo}
              disabled={!esNuevo}
              onChange={(e) => campo("codigo", e.target.value)}
            />
          </div>
          <div className="field">
            <label>Descripción</label>
            <input
              className="input"
              value={form.nombre}
              onChange={(e) => campo("nombre", e.target.value)}
            />
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Costo</label>
              <input
                className="input"
                inputMode="decimal"
                value={form.precioCosto}
                onChange={(e) => campo("precioCosto", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Precio de venta (IVA incl.)</label>
              <input
                className="input"
                inputMode="decimal"
                value={form.precioVenta}
                onChange={(e) => campo("precioVenta", e.target.value)}
              />
            </div>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>IVA</label>
              <select
                className="input"
                value={form.tipoIva}
                onChange={(e) => campo("tipoIva", e.target.value as FormProducto["tipoIva"])}
              >
                {TIPOS_IVA.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Rubro</label>
              <select
                className="input"
                value={form.categoriaId}
                onChange={(e) => campo("categoriaId", e.target.value)}
              >
                <option value="">— Sin rubro —</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {!esCombo && (
            <label className="check check--field">
              <input
                type="checkbox"
                checked={form.requiereLote}
                onChange={(e) => campo("requiereLote", e.target.checked)}
              />
              Producto perecedero (se gestiona por lotes con vencimiento)
            </label>
          )}

          {esCombo && (
            <div className="field">
              <label>Componentes del combo</label>
              <p className="muted combo-ayuda">
                Al vender este combo se descuenta el stock de cada componente.
              </p>
              <div className="combo-comps">
                {form.componentes.length === 0 && (
                  <div className="muted">Todavía no agregaste componentes.</div>
                )}
                {form.componentes.map((c, i) => (
                  <div key={i} className="combo-comp">
                    <select
                      className="input"
                      value={c.componenteId}
                      onChange={(e) => cambiarComponente(i, { componenteId: e.target.value })}
                    >
                      <option value="">— Elegí un producto —</option>
                      {simplesDisponibles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input input--mini"
                      inputMode="decimal"
                      aria-label="Cantidad"
                      value={c.cantidad}
                      onChange={(e) => cambiarComponente(i, { cantidad: e.target.value })}
                    />
                    <button
                      type="button"
                      className="linkbtn linkbtn--danger"
                      onClick={() => quitarComponente(i)}
                    >
                      Quitar
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" className="pill-btn" onClick={agregarComponente}>
                + Agregar componente
              </button>
            </div>
          )}

          {errores.length > 0 && (
            <div className="error">
              {errores.map((e, i) => (
                <div key={i}>{e}</div>
              ))}
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </button>
          <button type="button" className="pill-btn pill-btn--primary" onClick={() => void guardar()} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
