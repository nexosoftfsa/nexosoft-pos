/**
 * Sube el logo del comercio al servidor de sucursal, para que admin-web (que
 * corre en otra máquina/navegador) también lo pueda mostrar. Best-effort: si
 * falla (sin sesión ADMIN, sin red), no rompe el guardado local del logo en
 * el POS — la copia local en SQLite sigue siendo la fuente de verdad offline.
 */
export class ClienteComercioHttp {
  constructor(
    private readonly baseUrl: string,
    private readonly obtenerToken: () => string | null,
  ) {}

  async actualizarLogo(logoBase64: string): Promise<void> {
    const token = this.obtenerToken();
    if (token === null) return;
    try {
      await fetch(`${this.baseUrl}/comercio/logo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ logoBase64 }),
      });
    } catch {
      // Sin red o servidor caído: se reintentará en el próximo guardado de config.
    }
  }
}
