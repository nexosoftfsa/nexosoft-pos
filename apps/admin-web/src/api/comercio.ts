import type { ClienteApi } from "./cliente-http";

export interface EstadoLogo {
  readonly logoBase64: string | null;
}

export function obtenerLogo(api: ClienteApi): Promise<EstadoLogo> {
  return api.get<EstadoLogo>("/comercio/logo");
}
