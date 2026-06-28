import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { PuntoSerie } from "../api/reportes";
import { fechaCorta, formatearMoneda } from "../formato";

/** Evolución diaria del total vendido. */
export function GraficoSerie({ datos }: { datos: PuntoSerie[] }) {
  const puntos = datos.map((p) => ({
    fecha: fechaCorta(p.fecha),
    total: Number(p.total),
    cantidad: p.cantidad,
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={puntos} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="fecha" stroke="#94a3b8" fontSize={12} />
        <YAxis stroke="#94a3b8" fontSize={12} width={70} />
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          labelStyle={{ color: "#e2e8f0" }}
          formatter={(valor: number) => [formatearMoneda(String(valor)), "Total"]}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke="#38bdf8"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
