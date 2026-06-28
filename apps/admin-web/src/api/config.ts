/**
 * URL base del cloud-api (servidor de sucursal). Configurable por entorno:
 * en build se inyecta `VITE_API_URL`; por defecto apunta al servidor local.
 */
export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3000/api/v1";
