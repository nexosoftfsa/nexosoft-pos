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
        resolve(canvas.toDataURL("image/jpeg", calidad));
      };
      img.onerror = () => reject(new Error("El archivo no es una imagen válida."));
      img.src = String(lector.result);
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}
