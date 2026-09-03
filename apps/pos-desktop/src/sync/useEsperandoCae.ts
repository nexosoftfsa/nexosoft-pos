/**
 * Cuántos comprobantes ya subidos siguen esperando el CAE de ARCA.
 *
 * Lo pregunta al servidor y no a la base local a propósito: el CAE lo consigue
 * el servidor por su cuenta (`CaePendientesService`), sin que la terminal
 * participe. Contarlo desde la copia local daría un número que sólo sube y
 * nunca baja, porque la terminal no se entera cuando ARCA autoriza.
 */
import { useCallback, useEffect, useState } from "react";

import type { ClienteVentas, EsperandoCae } from "./cliente-ventas";

/**
 * Cada cuánto se pregunta. Es un contador informativo y el servidor reintenta
 * los pendientes en su propio ciclo: preguntar seguido no adelantaría nada.
 */
const INTERVALO_MS = 60_000;

export function useEsperandoCae(cliente: ClienteVentas | null): EsperandoCae | null {
  const [estado, setEstado] = useState<EsperandoCae | null>(null);

  const consultar = useCallback(async () => {
    if (cliente === null) return;
    try {
      setEstado(await cliente.esperandoCae());
    } catch {
      // Sin servidor no se sabe, y no se inventa: se deja el último valor. El
      // "Sin conexión" de la píldora ya cuenta esa parte de la historia.
    }
  }, [cliente]);

  useEffect(() => {
    void consultar();
    const id = setInterval(() => void consultar(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [consultar]);

  return estado;
}
