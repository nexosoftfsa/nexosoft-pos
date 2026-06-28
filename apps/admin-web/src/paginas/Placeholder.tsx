/**
 * Marcador de sección. Las vistas reales (KPIs, gráficos, tablas) se construyen
 * en las sub-fases 6.3 (ventas) y 6.4 (productos/stock).
 */
export function Placeholder({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <section className="placeholder">
      <h2>{titulo}</h2>
      <p>Esta sección se completa en la {fase}.</p>
    </section>
  );
}
