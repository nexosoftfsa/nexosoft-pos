/** Lee un `File` del navegador como data URL (`data:image/png;base64,...`). */
export function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/**
 * Lee una imagen y la devuelve redimensionada/comprimida como data URL JPEG.
 * Las fotos de celular actuales suelen pesar varios MB — muy por encima de lo
 * que hace falta para un avatar circular chico o una foto impresa en 2x2cm en
 * la credencial. En vez de limitar el tamaño del archivo original (rechazando
 * fotos reales de hoy en día), se acepta cualquier imagen de origen y se la
 * reescala del lado del cliente: el resultado queda liviano sin perder
 * calidad visible en el uso que se le da.
 */
export function redimensionarImagen(
  archivo: File,
  maxLado = 480,
  calidad = 0.85,
  tipoSalida = "image/jpeg",
): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const ancho = Math.round(img.width * escala);
        const alto = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = ancho;
        canvas.height = alto;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("No se pudo procesar la imagen."));
          return;
        }
        ctx.drawImage(img, 0, 0, ancho, alto);
        resolve(canvas.toDataURL(tipoSalida, calidad));
      };
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.src = String(lector.result);
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}

/**
 * Tope de lo que se guarda como logo. No es un límite para el usuario: el logo
 * queda embebido en SQLite y viaja en cada impresión, así que lo que importa
 * es el tamaño FINAL, no el del archivo que eligió. Antes se rechazaba
 * cualquier archivo de más de 300 KB, que es un tamaño ridículamente chico
 * para un logo que sale de un diseñador o de un celular.
 */
export const LOGO_MAX_BYTES = 300 * 1024;

/** Lado máximo del logo ya procesado. Alcanza para el ticket, el A4 y el panel. */
const LOGO_MAX_LADO = 400;

/**
 * Un logo suele tener fondo transparente y perderlo se nota (queda un
 * rectángulo blanco sobre el fondo del ticket o del panel). Por eso el PNG y
 * el WEBP se reencodean como PNG y no como JPEG, aunque pesen más.
 */
export function tipoDeSalidaDeLogo(tipoOrigen: string): string {
  return tipoOrigen === "image/png" || tipoOrigen === "image/webp" ? "image/png" : "image/jpeg";
}

/** Bytes que ocupa el contenido de una data URL base64 (sin el encabezado). */
export function bytesDeDataUrl(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const relleno = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - relleno);
}

/**
 * Deja el logo listo para guardar: lo reescala y, si aun así quedó pesado,
 * baja a JPEG y despues afloja la calidad. Solo falla si ni el peor caso
 * entra — y ahí sí es un problema real del archivo, no una regla arbitraria.
 */
export async function prepararLogo(archivo: File): Promise<string> {
  const preferido = await redimensionarImagen(
    archivo,
    LOGO_MAX_LADO,
    0.9,
    tipoDeSalidaDeLogo(archivo.type),
  );
  if (bytesDeDataUrl(preferido) <= LOGO_MAX_BYTES) return preferido;

  for (const calidad of [0.85, 0.7, 0.5]) {
    const jpeg = await redimensionarImagen(archivo, LOGO_MAX_LADO, calidad, "image/jpeg");
    if (bytesDeDataUrl(jpeg) <= LOGO_MAX_BYTES) return jpeg;
  }
  throw new Error(
    "No pude achicar esta imagen lo suficiente. Probá con una versión más simple del logo.",
  );
}
