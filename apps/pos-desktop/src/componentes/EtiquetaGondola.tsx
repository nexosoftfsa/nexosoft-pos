/**
 * Fase 10.5: etiqueta de góndola (precio + código de barras) e impresión en
 * hoja A4. Tamaño de grilla pensado para recortar con tijera si el papel no
 * es autoadhesivo pre-troquelado — ajustar `.etiqueta` en `estilos.css`
 * cuando se conozca el papel real que use el comercio.
 */
import { CodigoBarrasSvg } from "./CodigoBarrasSvg";
import { pesos } from "../formato";
import { Money } from "@nexosoft/domain";

export interface EtiquetaAImprimir {
  readonly codigo: string;
  readonly nombre: string;
  readonly precio: string; // decimal string, ej. "1850.00"
}

function Etiqueta({ item }: { item: EtiquetaAImprimir }) {
  let precioFormateado = item.precio;
  try {
    precioFormateado = pesos(Money.desde(item.precio));
  } catch {
    // deja el string crudo si no se puede parsear
  }
  return (
    <div className="etiqueta">
      <div className="etiqueta-nombre">{item.nombre}</div>
      <div className="etiqueta-precio">{precioFormateado}</div>
      <div className="etiqueta-barras">
        <CodigoBarrasSvg codigo={item.codigo} alto={28} />
      </div>
      <div className="etiqueta-codigo">{item.codigo}</div>
    </div>
  );
}

export function HojaEtiquetas({ etiquetas }: { etiquetas: readonly EtiquetaAImprimir[] }) {
  return (
    <div className="hoja-etiquetas">
      {etiquetas.map((e, i) => (
        <Etiqueta key={`${e.codigo}-${i}`} item={e} />
      ))}
    </div>
  );
}
