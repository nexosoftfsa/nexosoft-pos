/**
 * Pantalla de Stock (Fase 7.3 + 8.2): saldos por producto con estado (ok/bajo/sin),
 * KPIs del inventario, registro de movimientos (ingreso/ajuste/salida) e historial.
 * Los productos perecederos (Fase 8.2) llevan lotes: el ingreso pide vencimiento,
 * hay una vista de lotes por producto y un panel de alertas de vencimiento. Online
 * contra el módulo de stock del cloud-api.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ErrorStock,
  type AlertaVencimiento,
  type ClienteStock,
  type LoteStock,
  type MovimientoStock,
  type ProductoStock,
  type SaldoStock,
} from "../sync/cliente-stock";
import {
  aDatosMovimiento,
  calcularKpis,
  estadoStock,
  estadoVencimiento,
  etiquetaMovimiento,
  fechaCorta,
  FORM_MOVIMIENTO_VACIO,
  pideLote,
  sumaAlSaldo,
  textoVencimiento,
  TIPOS_MOVIMIENTO,
  validarMovimiento,
  type FormMovimiento,
} from "./stock-helpers";

function mensaje(e: unknown): string {
  if (e instanceof ErrorStock) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function fechaHora(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const UMBRAL_DEFECTO = 5;

export function StockAbm({ cliente }: { cliente: ClienteStock }) {
  const [saldos, setSaldos] = useState<SaldoStock[]>([]);
  const [alertas, setAlertas] = useState<AlertaVencimiento[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [umbral, setUmbral] = useState(UMBRAL_DEFECTO);
  const [soloAlertas, setSoloAlertas] = useState(false);
  const [movProducto, setMovProducto] = useState<ProductoStock | "abierto" | null>(null);
  const [historialDe, setHistorialDe] = useState<ProductoStock | null>(null);
  const [lotesDe, setLotesDe] = useState<ProductoStock | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ss, vs] = await Promise.all([cliente.saldos(), cliente.vencimientos()]);
      setSaldos(ss);
      setAlertas(vs);
    } catch (e) {
      setError(mensaje(e));
    } finally {
      setCargando(false);
    }
  }, [cliente]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const kpis = useMemo(() => calcularKpis(saldos, umbral), [saldos, umbral]);
  const productos = useMemo(() => saldos.map((s) => s.producto), [saldos]);

  const filtrados = useMemo(
    () => (soloAlertas ? saldos.filter((s) => estadoStock(s.saldo, umbral) !== "ok") : saldos),
    [saldos, soloAlertas, umbral],
  );

  return (
    <div className="gestion">
      <div className="kpis kpis--4">
        <div className="kpi">
          <div className="kpi__label">Artículos activos</div>
          <div className="kpi__val">{kpis.activos}</div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Bajo mínimo</div>
          <div className="kpi__val" style={{ color: "var(--warn)" }}>
            {kpis.bajo}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Sin stock</div>
          <div className="kpi__val" style={{ color: "var(--peligro, #e5484d)" }}>
            {kpis.sin}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi__label">Lotes por vencer</div>
          <div className="kpi__val" style={{ color: alertas.length > 0 ? "var(--warn)" : undefined }}>
            {alertas.length}
          </div>
        </div>
      </div>

      {alertas.length > 0 && (
        <div className="card card__pad section-alertas">
          <div className="section-title">Alertas de vencimiento</div>
          <div className="alertas">
            {alertas.map((a) => {
              const est = estadoVencimiento(a.diasParaVencer, a.vencido);
              return (
                <div key={a.loteId} className={`alerta alerta--${est}`}>
                  <div className="alerta__prod">
                    {a.producto.nombre}
                    {a.numero !== null && <span className="muted"> · Lote {a.numero}</span>}
                  </div>
                  <div className="alerta__meta">
                    <span className={`badge badge--venc-${est}`}>
                      {textoVencimiento(a.diasParaVencer, a.vencido)}
                    </span>
                    <span className="muted">
                      {fechaCorta(a.fechaVencimiento)} · saldo {a.saldo}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="toolbar">
        <label className="check">
          Umbral de alerta
          <input
            type="number"
            min={0}
            className="input input--mini"
            value={umbral}
            onChange={(e) => setUmbral(Math.max(0, Number(e.target.value) || 0))}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
          Ver sólo alertas
        </label>
        <div className="spacer" />
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => setMovProducto("abierto")}>
          + Registrar movimiento
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}

      <div className="card">
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th className="num">Saldo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr>
                  <td colSpan={5} className="td-vacio">
                    Cargando stock…
                  </td>
                </tr>
              )}
              {!cargando && filtrados.length === 0 && (
                <tr>
                  <td colSpan={5} className="td-vacio">
                    No hay artículos para mostrar.
                  </td>
                </tr>
              )}
              {!cargando &&
                filtrados.map((s) => {
                  const estado = estadoStock(s.saldo, umbral);
                  return (
                    <tr key={s.producto.id}>
                      <td className="strong">{s.producto.codigo}</td>
                      <td>
                        {s.producto.nombre}
                        {s.producto.requiereLote && <span className="badge badge--lote">Lote</span>}
                      </td>
                      <td className="num strong">{s.saldo}</td>
                      <td>
                        {estado === "ok" && <span className="badge badge--ok">OK</span>}
                        {estado === "bajo" && <span className="badge badge--warn">Bajo mínimo</span>}
                        {estado === "sin" && <span className="badge badge--danger">Sin stock</span>}
                      </td>
                      <td className="acciones">
                        <button type="button" className="linkbtn" onClick={() => setMovProducto(s.producto)}>
                          Movimiento
                        </button>
                        {s.producto.requiereLote && (
                          <button type="button" className="linkbtn" onClick={() => setLotesDe(s.producto)}>
                            Lotes
                          </button>
                        )}
                        <button type="button" className="linkbtn" onClick={() => setHistorialDe(s.producto)}>
                          Historial
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {movProducto !== null && (
        <ModalMovimiento
          cliente={cliente}
          productos={productos}
          productoInicial={movProducto === "abierto" ? null : movProducto}
          onCerrar={() => setMovProducto(null)}
          onGuardado={() => {
            setMovProducto(null);
            void cargar();
          }}
        />
      )}

      {lotesDe !== null && (
        <ModalLotes cliente={cliente} producto={lotesDe} onCerrar={() => setLotesDe(null)} />
      )}

      {historialDe !== null && (
        <ModalHistorial cliente={cliente} producto={historialDe} onCerrar={() => setHistorialDe(null)} />
      )}
    </div>
  );
}

function ModalMovimiento({
  cliente,
  productos,
  productoInicial,
  onCerrar,
  onGuardado,
}: {
  cliente: ClienteStock;
  productos: readonly ProductoStock[];
  productoInicial: ProductoStock | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [form, setForm] = useState<FormMovimiento>(() => ({
    ...FORM_MOVIMIENTO_VACIO,
    ...(productoInicial !== null ? { productoId: productoInicial.id } : {}),
  }));
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  function campo<K extends keyof FormMovimiento>(clave: K, valor: FormMovimiento[K]) {
    setForm((f) => ({ ...f, [clave]: valor }));
  }

  const productoSel = productos.find((p) => p.id === form.productoId);
  const requiereLote = productoSel?.requiereLote ?? false;
  const conLote = pideLote(form.tipo, requiereLote);

  async function guardar() {
    const erroresForm = validarMovimiento(form, requiereLote);
    if (erroresForm.length > 0) {
      setErrores(erroresForm);
      return;
    }
    setGuardando(true);
    setErrores([]);
    try {
      await cliente.registrarMovimiento(aDatosMovimiento(form, requiereLote));
      onGuardado();
    } catch (e) {
      setErrores([mensaje(e)]);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Registrar movimiento de stock</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          <div className="field">
            <label>Producto</label>
            <select
              className="input"
              value={form.productoId}
              disabled={productoInicial !== null}
              onChange={(e) => campo("productoId", e.target.value)}
            >
              <option value="">— Elegí un producto —</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.nombre}
                  {p.requiereLote ? " (por lote)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="modal__row">
            <div className="field">
              <label>Tipo</label>
              <select
                className="input"
                value={form.tipo}
                onChange={(e) => campo("tipo", e.target.value as FormMovimiento["tipo"])}
              >
                {TIPOS_MOVIMIENTO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.signo} {t.etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Cantidad</label>
              <input
                className="input"
                inputMode="decimal"
                value={form.cantidad}
                onChange={(e) => campo("cantidad", e.target.value)}
              />
            </div>
          </div>
          {conLote && (
            <div className="modal__row">
              <div className="field">
                <label>Vencimiento del lote</label>
                <input
                  className="input"
                  type="date"
                  value={form.fechaVencimiento}
                  onChange={(e) => campo("fechaVencimiento", e.target.value)}
                />
              </div>
              <div className="field">
                <label>N° de lote (opcional)</label>
                <input
                  className="input"
                  value={form.numeroLote}
                  onChange={(e) => campo("numeroLote", e.target.value)}
                />
              </div>
            </div>
          )}
          {requiereLote && form.tipo === "SALIDA" && (
            <p className="muted combo-ayuda">La salida consume los lotes que vencen antes (FEFO).</p>
          )}
          <div className="field">
            <label>Motivo (opcional)</label>
            <input
              className="input"
              value={form.motivo}
              onChange={(e) => campo("motivo", e.target.value)}
              placeholder="Ej.: compra a proveedor, rotura, conteo…"
            />
          </div>
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
            {guardando ? "Guardando…" : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalLotes({
  cliente,
  producto,
  onCerrar,
}: {
  cliente: ClienteStock;
  producto: ProductoStock;
  onCerrar: () => void;
}) {
  const [lotes, setLotes] = useState<LoteStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cliente
      .lotes(producto.id)
      .then((ls) => vivo && setLotes(ls))
      .catch((e: unknown) => vivo && setError(mensaje(e)));
    return () => {
      vivo = false;
    };
  }, [cliente, producto.id]);

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Lotes — {producto.nombre}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {error !== null && <div className="error">{error}</div>}
          {error === null && lotes === null && <div className="muted">Cargando…</div>}
          {lotes !== null && lotes.length === 0 && <div className="muted">Sin lotes registrados.</div>}
          {lotes !== null && lotes.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>N° de lote</th>
                    <th>Vencimiento</th>
                    <th className="num">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {lotes.map((l) => (
                    <tr key={l.id}>
                      <td className="strong">{l.numero ?? <span className="muted">—</span>}</td>
                      <td>{fechaCorta(l.fechaVencimiento)}</td>
                      <td className="num strong">{l.saldo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn pill-btn--primary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalHistorial({
  cliente,
  producto,
  onCerrar,
}: {
  cliente: ClienteStock;
  producto: ProductoStock;
  onCerrar: () => void;
}) {
  const [movimientos, setMovimientos] = useState<MovimientoStock[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    cliente
      .historial(producto.id)
      .then((ms) => vivo && setMovimientos(ms))
      .catch((e: unknown) => vivo && setError(mensaje(e)));
    return () => {
      vivo = false;
    };
  }, [cliente, producto.id]);

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>Historial — {producto.nombre}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {error !== null && <div className="error">{error}</div>}
          {error === null && movimientos === null && <div className="muted">Cargando…</div>}
          {movimientos !== null && movimientos.length === 0 && (
            <div className="muted">Sin movimientos registrados.</div>
          )}
          {movimientos !== null && movimientos.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th className="num">Cantidad</th>
                    <th>Motivo</th>
                  </tr>
                </thead>
                <tbody>
                  {movimientos.map((m) => (
                    <tr key={m.id}>
                      <td>{fechaHora(m.creadoEn)}</td>
                      <td>{etiquetaMovimiento(m.tipo)}</td>
                      <td className="num strong" style={{ color: sumaAlSaldo(m.tipo) ? "var(--ok-fuerte)" : "var(--peligro, #e5484d)" }}>
                        {sumaAlSaldo(m.tipo) ? "+" : "−"}
                        {m.cantidad}
                      </td>
                      <td>{m.motivo ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="modal__foot">
          <button type="button" className="pill-btn pill-btn--primary" onClick={onCerrar}>
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
