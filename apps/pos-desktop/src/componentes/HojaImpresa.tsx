/**
 * Saca lo que se va a imprimir de la pantalla que lo mandó a imprimir.
 *
 * Los templates (`ComprobanteA4`, `ComprobanteTicket`, `ComprobanteCredencial`)
 * se renderizan donde los pide el componente que imprime, y eso los dejaba
 * heredando el CSS de esa pantalla. El resultado lo encontró Sebastián el
 * 26/9/2026 comparando dos PDF de la MISMA factura:
 *
 *     Original (desde la caja)     Duplicado (desde Comprobantes)
 *     Descripción  Cantidad …      DESCRIPCIÓN  CANTIDAD …
 *
 * Los módulos de gestión cuelgan de `.gestion`, que tiene su propia regla para
 * las tablas (`.gestion th { text-transform: uppercase }`). Misma
 * especificidad que `.a4-items th` y más abajo en la hoja de estilos, así que
 * ganaba — y la reimpresión salía con otra tipografía y otro interlineado que
 * el original. Un duplicado tiene que ser el mismo papel, no un parecido.
 *
 * Con el portal la hoja cuelga de `<body>` y le llegan sólo sus propias
 * reglas, salga de donde salga la impresión.
 */
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

export function HojaImpresa({ children }: { children: ReactNode }) {
  // En un entorno sin DOM (tests de render en Node) no hay a dónde portar: se
  // devuelve tal cual, que para el caso es lo mismo.
  if (typeof document === "undefined") return <>{children}</>;
  return createPortal(children, document.body);
}
