/**
 * Registro de módulos del POS y reglas de visibilidad por rol. Es la base del
 * menú lateral (Fase 7.1): qué secciones existen, en qué orden y quién las ve.
 * Todas las pantallas están implementadas (Inicio, Ventas, Caja, Comprobantes,
 * Presupuestos, Remitos, Catálogo, Stock, Cuentas Corrientes, Reportes y el
 * Asistente IA con mock funcional).
 *
 * El gateo por rol es UX: el backend igual impone permisos en sus endpoints
 * (RolesGuard). Decisión del usuario (2026-06-28): gatear el menú por rol.
 *
 * El gateo por **plan** (ADR-0067) es distinto: no esconde nada. Un módulo que
 * no entra en el plan se sigue viendo, con candado — si Básica escondiera
 * Reportes, el comercio nunca se enteraría de que existe y nunca lo compraría.
 * Qué módulo entra en qué plan sale de `@nexosoft/licencias`, que es la tabla
 * que también impone el backend.
 */
import type { ReactNode } from "react";

import { PLAN_MINIMO, moduloDisponible, type ModuloId, type Plan } from "@nexosoft/licencias";

import {
  IconoCaja,
  IconoCatalogo,
  IconoComprobantes,
  IconoConfig,
  IconoCtaCte,
  IconoEtiqueta,
  IconoIa,
  IconoInicio,
  IconoPos,
  IconoPresupuesto,
  IconoProveedor,
  IconoRemito,
  IconoTarjeta,
  IconoReportes,
  IconoStock,
  IconoUsuarios,
} from "./iconos";

export type Rol = "ADMIN" | "SUPERVISOR" | "CAJERO";

export type Seccion = "Operación" | "Gestión" | "Inteligencia" | "Sistema";

/** Orden de las secciones en el menú. */
export const SECCIONES: readonly Seccion[] = [
  "Operación",
  "Gestión",
  "Inteligencia",
  "Sistema",
];

export interface DefinicionModulo {
  /**
   * El id es un `ModuloId` de `@nexosoft/licencias` a propósito: así un módulo
   * nuevo **no compila** hasta que alguien decida en qué plan entra.
   */
  readonly id: ModuloId;
  readonly titulo: string;
  /** Migaja de pan que se muestra bajo el título en la barra superior. */
  readonly crumb: string;
  readonly seccion: Seccion;
  readonly icono: () => ReactNode;
  /** Roles que ven el módulo en el menú. */
  readonly roles: readonly Rol[];
  /** Etiqueta opcional (ej. "Nuevo", "F12"). */
  readonly badge?: string;
  /**
   * El módulo se resuelve fuera del shell (Configuración reabre la fase de
   * config del `App`, que persiste y reinicializa el entorno).
   */
  readonly externo?: boolean;
}

const TODOS: readonly Rol[] = ["ADMIN", "SUPERVISOR", "CAJERO"];
const GESTION: readonly Rol[] = ["ADMIN", "SUPERVISOR"];
// Gestión de usuarios (rol/permisos) es más sensible que el resto: solo ADMIN.
const SOLO_ADMIN: readonly Rol[] = ["ADMIN"];

export const MODULOS: readonly DefinicionModulo[] = [
  { id: "inicio", titulo: "Inicio", crumb: "Panel general", seccion: "Operación", icono: IconoInicio, roles: TODOS },
  { id: "pos", titulo: "Punto de Venta", crumb: "Operación · Caja", seccion: "Operación", icono: IconoPos, roles: TODOS },
  { id: "caja", titulo: "Caja y Tesorería", crumb: "Turno de caja", seccion: "Operación", icono: IconoCaja, roles: TODOS },
  { id: "comprobantes", titulo: "Comprobantes", crumb: "Facturas y notas de crédito", seccion: "Operación", icono: IconoComprobantes, roles: TODOS },
  { id: "presupuestos", titulo: "Presupuestos", crumb: "Cotizaciones no fiscales", seccion: "Operación", icono: IconoPresupuesto, roles: TODOS },
  { id: "remitos", titulo: "Remitos", crumb: "Documentos de entrega", seccion: "Operación", icono: IconoRemito, roles: TODOS },
  { id: "catalogo", titulo: "Catálogo y Precios", crumb: "Artículos y listas", seccion: "Gestión", icono: IconoCatalogo, roles: GESTION },
  { id: "stock", titulo: "Stock e Inventario", crumb: "Existencias", seccion: "Gestión", icono: IconoStock, roles: GESTION },
  { id: "ctacte", titulo: "Cuentas Corrientes", crumb: "Clientes y proveedores", seccion: "Gestión", icono: IconoCtaCte, roles: GESTION },
  { id: "etiquetas", titulo: "Etiquetas de góndola", crumb: "Buscar o escanear, exportar a Excel", seccion: "Gestión", icono: IconoEtiqueta, roles: GESTION },
  { id: "proveedores", titulo: "Proveedores", crumb: "Altas y datos de contacto", seccion: "Gestión", icono: IconoProveedor, roles: GESTION },
  { id: "medios-pago", titulo: "Medios de pago", crumb: "Tarjetas por banco y tasas", seccion: "Gestión", icono: IconoTarjeta, roles: GESTION },
  { id: "reportes", titulo: "Reportes y Estadísticas", crumb: "Tablero", seccion: "Inteligencia", icono: IconoReportes, roles: GESTION },
  { id: "ia", titulo: "Asistente IA", crumb: "OCR + Métricas", seccion: "Inteligencia", icono: IconoIa, roles: GESTION, badge: "Nuevo" },
  { id: "usuarios", titulo: "Usuarios", crumb: "Altas, roles y permisos", seccion: "Sistema", icono: IconoUsuarios, roles: SOLO_ADMIN },
  { id: "config", titulo: "Configuración", crumb: "Empresa · Fiscal", seccion: "Sistema", icono: IconoConfig, roles: GESTION, externo: true },
];

export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador",
  SUPERVISOR: "Supervisor",
  CAJERO: "Cajero",
};

/** Normaliza el rol del token. Un rol desconocido cae al menor privilegio. */
export function normalizarRol(rol: string | undefined): Rol {
  return rol === "ADMIN" || rol === "SUPERVISOR" || rol === "CAJERO" ? rol : "CAJERO";
}

/** Módulos que el rol puede ver en el menú, en el orden declarado. */
export function modulosVisibles(rol: string | undefined): readonly DefinicionModulo[] {
  const r = normalizarRol(rol);
  return MODULOS.filter((m) => m.roles.includes(r));
}

/**
 * Módulo en el que arranca el POS después del login: el panel general
 * (Inicio). Antes caía directo en Ventas; se cambió porque Inicio da el
 * estado del día de un vistazo y desde ahí se entra a vender con un clic,
 * mientras que al revés hay que salir de la pantalla de venta para ver
 * cualquier otra cosa.
 */
export function moduloInicial(rol: string | undefined): string {
  const visibles = modulosVisibles(rol);
  return visibles.find((m) => m.id === "inicio")?.id ?? visibles[0]?.id ?? "inicio";
}

/** Busca un módulo por id. */
export function buscarModulo(id: string): DefinicionModulo | undefined {
  return MODULOS.find((m) => m.id === id);
}

/** El plan mínimo que habilita ese módulo (ADR-0067 §7). */
export function planDelModulo(modulo: DefinicionModulo): Plan {
  return PLAN_MINIMO[modulo.id];
}

/** `true` si el comercio, con su plan, puede entrar a ese módulo. */
export function moduloEnPlan(modulo: DefinicionModulo, plan: Plan): boolean {
  return moduloDisponible(modulo.id, plan);
}
