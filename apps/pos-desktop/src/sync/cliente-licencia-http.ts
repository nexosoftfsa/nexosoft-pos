import type { EstadoLicencia } from "@nexosoft/licencias";

/**
 * Estado de la suscripción según el servidor de sucursal (ADR-0056).
 *
 * El servidor ya verificó la firma de la licencia; acá sólo se lee el
 * veredicto. **Nunca lanza**: sin red, con el servidor caído o contra un
 * servidor viejo que no tiene el endpoint, devuelve `null` y el POS sigue con
 * el último estado que tenga guardado.
 */
export class ClienteLicenciaHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async obtener(): Promise<EstadoLicencia | null> {
    const token = this.obtenerToken();
    if (token === null) return null;
    try {
      const res = await fetch(`${this.baseUrl}/licencia`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return (await res.json()) as EstadoLicencia;
    } catch {
      return null;
    }
  }
}
