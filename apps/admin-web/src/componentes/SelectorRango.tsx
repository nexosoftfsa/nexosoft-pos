import type { RangoFechas } from "../api/reportes";

function aISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dia}`;
}

function hace(dias: number): RangoFechas {
  const hasta = new Date();
  const desde = new Date();
  desde.setDate(desde.getDate() - dias);
  return { desde: aISO(desde), hasta: aISO(hasta) };
}

function esteMes(): RangoFechas {
  const hoy = new Date();
  return { desde: aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: aISO(hoy) };
}

/** Rango inicial por defecto de las páginas: últimos 30 días. */
export function rangoUltimos30(): RangoFechas {
  return hace(30);
}

const PRESETS = [
  { etiqueta: "Hoy", calcular: () => hace(0) },
  { etiqueta: "7 días", calcular: () => hace(7) },
  { etiqueta: "30 días", calcular: () => hace(30) },
  { etiqueta: "Este mes", calcular: esteMes },
] as const;

/** Selector de rango de fechas: presets rápidos + fechas manuales. Controlado. */
export function SelectorRango({
  rango,
  onChange,
}: {
  rango: RangoFechas;
  onChange: (r: RangoFechas) => void;
}) {
  return (
    <div className="rango">
      <div className="rango__presets">
        {PRESETS.map((p) => (
          <button
            key={p.etiqueta}
            className="boton boton--secundario boton--chico"
            onClick={() => onChange(p.calcular())}
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <div className="rango__fechas">
        <label className="campo campo--inline">
          <span>Desde</span>
          <input
            type="date"
            value={rango.desde ?? ""}
            max={rango.hasta}
            onChange={(e) => onChange({ ...rango, desde: e.target.value || undefined })}
          />
        </label>
        <label className="campo campo--inline">
          <span>Hasta</span>
          <input
            type="date"
            value={rango.hasta ?? ""}
            min={rango.desde}
            onChange={(e) => onChange({ ...rango, hasta: e.target.value || undefined })}
          />
        </label>
      </div>
    </div>
  );
}
