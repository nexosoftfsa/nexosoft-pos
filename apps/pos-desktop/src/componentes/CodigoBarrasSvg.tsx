/**
 * Fase 10.5: renderiza un EAN-13 como SVG a partir de `codificarEan13`. Si el
 * código no es un EAN-13 válido, no dibuja nada (el que llama decide si
 * muestra el texto del código solo).
 */
import { codificarEan13 } from "./codigo-barras-ean13";

export function CodigoBarrasSvg({
  codigo,
  alto = 40,
}: {
  readonly codigo: string;
  readonly alto?: number;
}) {
  const ean = codificarEan13(codigo);
  if (ean === null) return null;

  const anchoModulo = 1.6;
  const ancho = ean.barras.length * anchoModulo;

  let x = 0;
  const barras = [];
  for (const bit of ean.barras) {
    if (bit === "1") {
      barras.push(<rect key={x} x={x} y={0} width={anchoModulo} height={alto} fill="#000" />);
    }
    x += anchoModulo;
  }

  return (
    <svg width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`}>
      {barras}
    </svg>
  );
}
