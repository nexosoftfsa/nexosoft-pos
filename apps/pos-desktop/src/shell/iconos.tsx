/**
 * Íconos del menú lateral, portados de la maqueta (`prototipo/index.html`).
 * Son SVG de trazo (stroke) de 24×24 que heredan el color del texto del nav.
 */
import type { ReactNode } from "react";

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      {children}
    </svg>
  );
}

export function IconoInicio() {
  return (
    <Svg>
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
    </Svg>
  );
}

export function IconoPos() {
  return (
    <Svg>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M2 3h3l2.4 12.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L22 7H6" />
    </Svg>
  );
}

export function IconoCaja() {
  return (
    <Svg>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" />
      <circle cx="16.5" cy="14.5" r="1.5" />
    </Svg>
  );
}

export function IconoCatalogo() {
  return (
    <Svg>
      <path d="M20.6 13.4 12 22l-9-9V3h10z" />
      <circle cx="7.5" cy="7.5" r="1.3" />
    </Svg>
  );
}

export function IconoStock() {
  return (
    <Svg>
      <path d="M21 16V8l-9-5-9 5v8l9 5z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </Svg>
  );
}

export function IconoCtaCte() {
  return (
    <Svg>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
    </Svg>
  );
}

export function IconoReportes() {
  return (
    <Svg>
      <path d="M3 3v18h18" />
      <path d="M7 15l4-5 3 3 5-7" />
    </Svg>
  );
}

export function IconoIa() {
  return (
    <Svg>
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z" />
      <path d="M5 17l.9 2L8 20l-2.1.9L5 23l-.9-2.1L2 20l2.1-1z" />
    </Svg>
  );
}

export function IconoConfig() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 2 14.9a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 7l-.2-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9 4.6 1.6 1.6 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8 1.6 1.6 0 0 0 1.4 1H22a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </Svg>
  );
}

export function IconoComprobantes() {
  return (
    <Svg>
      <path d="M6 2h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" />
    </Svg>
  );
}

export function IconoPresupuesto() {
  return (
    <Svg>
      <path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-4" />
      <path d="M9 3v4h6V3M8 12h8M8 16h5" />
    </Svg>
  );
}

export function IconoMenu() {
  return (
    <Svg>
      <path d="M3 6h18M3 12h18M3 18h18" />
    </Svg>
  );
}

export function IconoSalir() {
  return (
    <Svg>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Svg>
  );
}
