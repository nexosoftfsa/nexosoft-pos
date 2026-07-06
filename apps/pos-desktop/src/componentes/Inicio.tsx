/**
 * Panel de Inicio: primer pantallazo del comercio. KPIs del día (ventas, por
 * cobrar, lotes por vencer, stock bajo) y accesos rápidos a los módulos. Los
 * datos salen de los mismos clientes que usan las otras pantallas; los que no
 * estén disponibles muestran "—".
 */
import { useEffect, useMemo, useState } from "react";

import type { ClienteReportes } from "../sync/cliente-reportes";
import type { ClienteStock } from "../sync/cliente-stock";
import type { ClienteCtaCte } from "../sync/cliente-ctacte";

const pesos = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

function hoyIso(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

interface Kpis {
  ventasHoy: string;
  cantidadHoy: number;
  porCobrar: string;
  porVencer: number;
  stockBajo: number;
}

const ACCESOS: ReadonlyArray<{ id: string; titulo: string; desc: string; icono: string }> = [
  { id: "pos", titulo: "Vender", desc: "Abrir el punto de venta", icono: "🛒" },
  { id: "caja", titulo: "Caja", desc: "Turno, ingresos y arqueo", icono: "💵" },
  { id: "stock", titulo: "Stock", desc: "Existencias y vencimientos", icono: "📦" },
  { id: "catalogo", titulo: "Catálogo", desc: "Artículos, precios y combos", icono: "🏷️" },
  { id: "ctacte", titulo: "Cuentas", desc: "Clientes y deudas", icono: "👥" },
  { id: "reportes", titulo: "Reportes", desc: "Ventas y estadísticas", icono: "📊" },
];

export function Inicio({
  nombreComercio,
  rolPuedeGestion,
  onNavegar,
  clienteReportes,
  clienteStock,
  clienteCtaCte,
}: {
  nombreComercio: string;
  rolPuedeGestion: boolean;
  onNavegar: (id: string) => void;
  clienteReportes?: ClienteReportes;
  clienteStock?: ClienteStock;
  clienteCtaCte?: ClienteCtaCte;
}) {
  const [kpis, setKpis] = useState<Kpis | null>(null);

  useEffect(() => {
    let vivo = true;
    async function cargar() {
      const [resumen, vencimientos, saldos, clientes] = await Promise.all([
        clienteReportes?.resumen({ desde: hoyIso(), hasta: hoyIso() }).catch(() => null),
        clienteStock?.vencimientos(30).catch(() => []),
        clienteStock?.saldos().catch(() => []),
        clienteCtaCte?.listar(false).catch(() => []),
      ]);
      if (!vivo) return;
      const porCobrar = (clientes ?? [])
        .map((c) => Number(c.saldo))
        .filter((n) => n > 0)
        .reduce((a, n) => a + n, 0);
      const stockBajo = (saldos ?? []).filter((s) => Number(s.saldo) <= 5).length;
      setKpis({
        ventasHoy: resumen ? resumen.totalVendido : "0",
        cantidadHoy: resumen ? resumen.cantidadVentas : 0,
        porCobrar: String(porCobrar),
        porVencer: (vencimientos ?? []).length,
        stockBajo,
      });
    }
    void cargar();
    return () => {
      vivo = false;
    };
  }, [clienteReportes, clienteStock, clienteCtaCte]);

  const accesos = useMemo(
    () => (rolPuedeGestion ? ACCESOS : ACCESOS.filter((a) => a.id === "pos" || a.id === "caja")),
    [rolPuedeGestion],
  );

  return (
    <div className="gestion inicio">
      <div className="inicio-hero card card__pad">
        <div>
          <h2 className="inicio-titulo">Hola 👋</h2>
          <p className="muted">
            Bienvenido a <strong>{nombreComercio}</strong>. Este es el pulso de hoy.
          </p>
        </div>
        <button type="button" className="pill-btn pill-btn--primary" onClick={() => onNavegar("pos")}>
          Ir a vender
        </button>
      </div>

      <div className="kpis kpis--4">
        <Kpi etiqueta="Ventas de hoy" valor={kpis ? pesos(Number(kpis.ventasHoy)) : "—"}
          sub={kpis ? `${kpis.cantidadHoy} venta(s)` : ""} />
        <Kpi etiqueta="Por cobrar" valor={kpis ? pesos(Number(kpis.porCobrar)) : "—"} sub="cuentas corrientes" />
        <Kpi etiqueta="Lotes por vencer" valor={kpis ? String(kpis.porVencer) : "—"}
          color={kpis && kpis.porVencer > 0 ? "var(--warn)" : undefined} sub="próximos 30 días" />
        <Kpi etiqueta="Stock bajo" valor={kpis ? String(kpis.stockBajo) : "—"}
          color={kpis && kpis.stockBajo > 0 ? "var(--peligro, #e5484d)" : undefined} sub="a reponer" />
      </div>

      <div className="section-title">Accesos rápidos</div>
      <div className="accesos">
        {accesos.map((a) => (
          <button key={a.id} type="button" className="acceso" onClick={() => onNavegar(a.id)}>
            <span className="acceso-icono">{a.icono}</span>
            <span className="acceso-titulo">{a.titulo}</span>
            <span className="acceso-desc">{a.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Kpi({ etiqueta, valor, sub, color }: { etiqueta: string; valor: string; sub?: string | undefined; color?: string | undefined }) {
  return (
    <div className="kpi">
      <div className="kpi__label">{etiqueta}</div>
      <div className="kpi__val" style={color ? { color } : undefined}>{valor}</div>
      {sub && <div className="kpi__sub muted">{sub}</div>}
    </div>
  );
}
