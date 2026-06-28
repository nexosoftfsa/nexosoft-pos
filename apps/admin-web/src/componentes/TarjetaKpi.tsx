/** Tarjeta de indicador (KPI) con etiqueta, valor destacado y detalle opcional. */
export function TarjetaKpi({
  etiqueta,
  valor,
  detalle,
}: {
  etiqueta: string;
  valor: string;
  detalle?: string;
}) {
  return (
    <div className="kpi">
      <span className="kpi__etiqueta">{etiqueta}</span>
      <span className="kpi__valor">{valor}</span>
      {detalle && <span className="kpi__detalle">{detalle}</span>}
    </div>
  );
}
