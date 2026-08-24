/**
 * Pantalla de Reportes en el POS (Fase 7.7): resumen de ventas, evolución diaria,
 * ventas por medio de pago y ranking de productos. Reusa los endpoints `/reportes`
 * del cloud-api (Fase 6). Restringido a ADMIN/SUPERVISOR por el backend.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import { Money } from "@nexosoft/domain";

import { descargarBlob } from "../descargas";
import { exportarExcel } from "../exportar-excel";
import {
  ErrorReportes,
  type ClienteReportes,
  type PuntoSerie,
  type Rentabilidad,
  type ResumenVentas,
  type TopProducto,
  type VentaPorMedio,
  type VentaPorRubro,
} from "../sync/cliente-reportes";
import { pesos } from "../formato";
import { etiquetaMedioPago } from "./comprobantes-helpers";
import {
  aIsoFechaHora,
  PRESETS,
  porcentaje,
  aIso,
  DIAS_TRABAJADOS_POR_PRESET,
  rangoDe,
  rangoDeDiasTrabajados,
  ultimosDiasTrabajados,
  ventanaDeBusqueda,
  sectoresDeTorta,
  type PresetRango,
  type RangoFechas,
} from "./reportes-helpers";

/** Colores fijos para la torta de rubros — no dependen de cuántos rubros haya. */
const PALETA_TORTA = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#059669", "#db2777", "#64748b"];
const TOP_RUBROS = 7;

/** Rango personalizado por defecto: desde la medianoche de hoy hasta ahora. */
function rangoPersonalizadoInicial(): RangoFechas {
  const ahora = new Date();
  const medianoche = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return { desde: aIsoFechaHora(medianoche), hasta: aIsoFechaHora(ahora) };
}

function mensaje(e: unknown): string {
  if (e instanceof ErrorReportes) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}

function money(valor: string): string {
  try {
    return pesos(Money.desde(valor));
  } catch {
    return valor;
  }
}

interface Datos {
  resumen: ResumenVentas;
  serie: PuntoSerie[];
  medios: VentaPorMedio[];
  rubros: VentaPorRubro[];
  top: TopProducto[];
  rentabilidad: Rentabilidad;
}

export function ReportesPos({ cliente }: { cliente: ClienteReportes }) {
  const [preset, setPreset] = useState<PresetRango>("treinta");
  const [rangoCustom, setRangoCustom] = useState<RangoFechas>(rangoPersonalizadoInicial);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rango efectivo del período. Para "7 días"/"30 días" ya no son días
  // corridos: se resuelve contra los datos (ver `cargar`), porque cuáles son
  // los últimos N días trabajados depende de cuándo abrió el comercio.
  const [rangoResuelto, setRangoResuelto] = useState<RangoFechas | null>(null);
  const rango = useMemo(() => {
    if (preset === "personalizado") return rangoCustom;
    return rangoResuelto ?? rangoDe(preset);
  }, [preset, rangoCustom, rangoResuelto]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      // Paso 1: qué días trabajó el comercio. La serie del servidor solo trae
      // los días con ventas, así que se pide una ventana ancha y se recortan
      // los últimos N. Con "personalizado" no se toca nada: ahí el rango lo
      // eligió la persona.
      const diasPreset = preset === "personalizado" ? 0 : DIAS_TRABAJADOS_POR_PRESET[preset];
      let serieGrafico: PuntoSerie[] = [];
      let rangoPeriodo = preset === "personalizado" ? rangoCustom : rangoDe(preset);

      if (diasPreset > 0) {
        const ventana = await cliente.serie(ventanaDeBusqueda(diasPreset));
        serieGrafico = ultimosDiasTrabajados(ventana, diasPreset);
        // "Hoy" es un día, no un período: los KPI siguen siendo los de hoy y
        // los días trabajados anteriores están solo para comparar en el
        // gráfico.
        if (preset !== "hoy" && preset !== "mes") {
          rangoPeriodo = rangoDeDiasTrabajados(serieGrafico);
        }
      }
      setRangoResuelto(preset === "personalizado" ? null : rangoPeriodo);

      const [resumen, serie, medios, rubros, top, rentabilidad] = await Promise.all([
        cliente.resumen(rangoPeriodo),
        cliente.serie(rangoPeriodo),
        cliente.porMedioPago(rangoPeriodo),
        cliente.porRubro(rangoPeriodo),
        cliente.topProductos(rangoPeriodo, 10),
        cliente.rentabilidad(rangoPeriodo),
      ]);
      setDatos({
        resumen,
        serie: diasPreset > 0 ? serieGrafico : serie,
        medios,
        rubros,
        top,
        rentabilidad,
      });
    } catch (e) {
      setError(mensaje(e));
      setDatos(null);
    } finally {
      setCargando(false);
    }
    // `rango` sale a propósito de las dependencias: lo calcula este mismo
    // efecto y volvería a dispararse solo, en loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cliente, preset, rangoCustom]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const maxSerie = useMemo(
    () => Math.max(1, ...(datos?.serie ?? []).map((p) => Number(p.total))),
    [datos],
  );
  const totalMedios = useMemo(
    () => (datos?.medios ?? []).reduce((a, m) => a + Number(m.total), 0).toFixed(2),
    [datos],
  );

  const rubrosParaTorta = useMemo(() => {
    const lista = datos?.rubros ?? [];
    if (lista.length <= TOP_RUBROS) return lista;
    const principales = lista.slice(0, TOP_RUBROS);
    const restoTotal = lista.slice(TOP_RUBROS).reduce((a, r) => a + Number(r.total), 0);
    return [...principales, { rubro: "Otros", total: restoTotal.toFixed(2) }];
  }, [datos]);
  const totalRubros = useMemo(
    () => rubrosParaTorta.reduce((a, r) => a + Number(r.total), 0).toFixed(2),
    [rubrosParaTorta],
  );
  const sectoresRubros = useMemo(
    () => sectoresDeTorta(rubrosParaTorta.map((r) => Number(r.total))),
    [rubrosParaTorta],
  );

  async function exportarResumen() {
    if (datos === null) return;
    try {
      const detalle = await cliente.detalleVentas(rango);
      const blob = await exportarExcel([
        {
          nombre: "Detalle",
          columnas: [
            { titulo: "SUCURSAL", ancho: 20 },
            { titulo: "FECHA", ancho: 14, formato: "dd/mm/yyyy hh:mm" },
            { titulo: "NRO_TICKET" },
            { titulo: "CODIGO", ancho: 16 },
            { titulo: "DESCRIPCIO", ancho: 32 },
            { titulo: "RUBRO", ancho: 20 },
            { titulo: "CANTIDAD" },
            { titulo: "UNITARIO" },
            { titulo: "TOTAL" },
            { titulo: "GANANCIA" },
          ],
          filas: detalle.map((l) => [
            l.sucursal,
            new Date(l.fecha),
            l.numeroTicket ?? "",
            l.codigo,
            l.descripcion,
            l.rubro ?? "",
            Number(l.cantidad),
            Number(l.unitario),
            Number(l.total),
            l.ganancia === null ? "" : Number(l.ganancia),
          ]),
        },
        {
          nombre: "Resumen",
          columnas: [{ titulo: "Métrica", ancho: 22 }, { titulo: "Valor", ancho: 20 }],
          filas: [
            ["Período", `${rango.desde} — ${rango.hasta}`],
            ["Total vendido", money(datos.resumen.totalVendido)],
            ["Cantidad de ventas", datos.resumen.cantidadVentas],
            ["Ticket promedio", money(datos.resumen.ticketPromedio)],
            ["Descuentos", money(datos.resumen.totalDescuentos)],
            ["Ganancia", money(datos.rentabilidad.gananciaBruta)],
          ],
        },
        {
          nombre: "Evolución diaria",
          columnas: [{ titulo: "Fecha" }, { titulo: "Total" }],
          filas: datos.serie.map((p) => [p.fecha, money(p.total)]),
        },
        {
          nombre: "Por medio de pago",
          columnas: [{ titulo: "Medio de pago", ancho: 22 }, { titulo: "Total" }],
          filas: datos.medios.map((m) => [etiquetaMedioPago(m.medioPago), money(m.total)]),
        },
        {
          nombre: "Por rubro",
          columnas: [{ titulo: "Rubro", ancho: 22 }, { titulo: "Total" }],
          filas: datos.rubros.map((r) => [r.rubro, money(r.total)]),
        },
        {
          nombre: "Productos más vendidos",
          columnas: [
            { titulo: "#" },
            { titulo: "Código" },
            { titulo: "Producto", ancho: 30 },
            { titulo: "Cantidad" },
            { titulo: "Monto" },
          ],
          filas: datos.top.map((p, i) => [i + 1, p.codigo, p.nombre, p.cantidad, money(p.monto)]),
        },
      ]);
      await descargarBlob(`reporte-ventas_${rango.desde.slice(0, 10)}_a_${rango.hasta.slice(0, 10)}.xlsx`, blob);
    } catch (e) {
      setError(mensaje(e));
    }
  }

  return (
    <div className="gestion">
      <div className="toolbar">
        <span className="seg">
          {PRESETS.map((p) => (
            <button
              key={p.valor}
              type="button"
              className={preset === p.valor ? "on" : ""}
              onClick={() => setPreset(p.valor)}
            >
              {p.etiqueta}
            </button>
          ))}
          <button
            type="button"
            className={preset === "personalizado" ? "on" : ""}
            onClick={() => setPreset("personalizado")}
          >
            Personalizado
          </button>
        </span>
        {preset === "personalizado" && (
          <span className="rango-personalizado">
            <label>
              Desde
              <input
                type="datetime-local"
                className="input"
                value={rangoCustom.desde}
                max={rangoCustom.hasta}
                onChange={(e) => setRangoCustom((r) => ({ ...r, desde: e.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="datetime-local"
                className="input"
                value={rangoCustom.hasta}
                min={rangoCustom.desde}
                onChange={(e) => setRangoCustom((r) => ({ ...r, hasta: e.target.value }))}
              />
            </label>
          </span>
        )}
        <div className="spacer" />
        <span className="muted">
          {rango.desde} — {rango.hasta}
        </span>
        <button type="button" className="pill-btn" disabled={datos === null} onClick={() => void exportarResumen()}>
          Exportar resumen
        </button>
      </div>

      {error !== null && <div className="error">{error}</div>}
      {cargando && <div className="muted">Cargando reportes…</div>}

      {!cargando && datos !== null && (
        <>
          <div className="kpis kpis--5">
            <div className="kpi">
              <div className="kpi__label">Total vendido</div>
              <div className="kpi__val">{money(datos.resumen.totalVendido)}</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Ventas</div>
              <div className="kpi__val">{datos.resumen.cantidadVentas}</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Ticket promedio</div>
              <div className="kpi__val">{money(datos.resumen.ticketPromedio)}</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Descuentos</div>
              <div className="kpi__val">{money(datos.resumen.totalDescuentos)}</div>
            </div>
            <div className="kpi">
              <div className="kpi__label">Ganancia</div>
              <div className="kpi__val">{money(datos.rentabilidad.gananciaBruta)}</div>
            </div>
          </div>

          <div className="rep-grid">
            <div className="card">
              <div className="card__head">
                <h3>Evolución de ventas</h3>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {preset === "personalizado"
                    ? "días con ventas del período"
                    : `últimos ${DIAS_TRABAJADOS_POR_PRESET[preset]} días trabajados`}
                </span>
              </div>
              <div className="card__pad">
                {datos.serie.length === 0 ? (
                  <div className="muted">Sin ventas en el período.</div>
                ) : (
                  <div className="bars">
                    {datos.serie.map((p) => {
                      // "Hoy" mostraba una sola barra al 100% ocupando la
                      // tarjeta entera, que no se compara contra nada. Ahora
                      // el día actual va resaltado entre los anteriores.
                      const esHoy = p.fecha.slice(0, 10) === aIso(new Date());
                      return (
                        <div
                          key={p.fecha}
                          className={`bar${esHoy ? " bar--hoy" : ""}`}
                          style={{ height: `${Math.max(4, (Number(p.total) / maxSerie) * 100)}%` }}
                          title={`${p.fecha}${esHoy ? " (hoy)" : ""}: ${money(p.total)}`}
                        >
                          <i>{esHoy ? "hoy" : p.fecha.slice(8, 10)}</i>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card__head">
                <h3>Ventas por medio de pago</h3>
              </div>
              <div className="card__pad">
                {datos.medios.length === 0 ? (
                  <div className="muted">Sin datos.</div>
                ) : (
                  datos.medios.map((m) => (
                    <div key={m.medioPago} className="barra-prop">
                      <div className="barra-prop__cab">
                        <span>{etiquetaMedioPago(m.medioPago)}</span>
                        <b>{money(m.total)}</b>
                      </div>
                      <div className="barra-prop__track">
                        <div
                          className="barra-prop__fill"
                          style={{ width: `${porcentaje(m.total, totalMedios)}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card__head">
              <h3>Rubros más vendidos</h3>
            </div>
            <div className="card__pad torta-rubros">
              {rubrosParaTorta.length === 0 ? (
                <div className="muted">Sin datos.</div>
              ) : (
                <>
                  <svg viewBox="0 0 100 100" className="torta-svg" aria-hidden>
                    {sectoresRubros.map((s, i) => (
                      <path key={i} d={s.path} fill={PALETA_TORTA[i % PALETA_TORTA.length]} />
                    ))}
                  </svg>
                  <div className="torta-leyenda">
                    {rubrosParaTorta.map((r, i) => (
                      <div key={r.rubro} className="barra-prop__cab">
                        <span className="torta-leyenda__etiqueta">
                          <i
                            className="torta-leyenda__punto"
                            style={{ background: PALETA_TORTA[i % PALETA_TORTA.length] }}
                          />
                          {r.rubro}
                        </span>
                        <b>
                          {money(r.total)} · {porcentaje(r.total, totalRubros).toFixed(0)}%
                        </b>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card" style={{ marginTop: 18 }}>
            <div className="card__head">
              <h3>Productos más vendidos</h3>
            </div>
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Código</th>
                    <th>Producto</th>
                    <th className="num">Cantidad</th>
                    <th className="num">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {datos.top.length === 0 && (
                    <tr>
                      <td colSpan={5} className="td-vacio">
                        Sin ventas en el período.
                      </td>
                    </tr>
                  )}
                  {datos.top.map((p, i) => (
                    <tr key={p.productoId}>
                      <td className="muted">{i + 1}</td>
                      <td>{p.codigo}</td>
                      <td className="strong">{p.nombre}</td>
                      <td className="num">{p.cantidad}</td>
                      <td className="num">{money(p.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
