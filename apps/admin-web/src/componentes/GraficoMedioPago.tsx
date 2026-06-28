import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import type { VentasPorMedioPago } from "../api/reportes";
import { etiquetaMedioPago, formatearMoneda } from "../formato";

const COLORES = ["#38bdf8", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];

/** Distribución del total vendido por medio de pago. */
export function GraficoMedioPago({ datos }: { datos: VentasPorMedioPago[] }) {
  const porciones = datos.map((d) => ({
    nombre: etiquetaMedioPago(d.medioPago),
    valor: Number(d.total),
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={porciones}
          dataKey="valor"
          nameKey="nombre"
          cx="50%"
          cy="50%"
          outerRadius={95}
          label={({ nombre }) => nombre}
        >
          {porciones.map((_, i) => (
            <Cell key={i} fill={COLORES[i % COLORES.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
          formatter={(valor: number) => formatearMoneda(String(valor))}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
