/** Lee un `File` del navegador como data URL (`data:image/png;base64,...`). */
export function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(String(lector.result));
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}
