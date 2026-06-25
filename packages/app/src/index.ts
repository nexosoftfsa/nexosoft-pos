/**
 * @nexosoft/app
 * Capa de aplicación: casos de uso del negocio sobre puertos de persistencia.
 * No depende de framework (ni Tauri ni NestJS); orquesta `@nexosoft/domain`.
 */
export * from "./config/configuracion-comercio.js";
export * from "./puertos/repositorios.js";
export * from "./memoria/repositorios-memoria.js";
export * from "./ventas/venta.js";
export * from "./ventas/servicio-venta.js";

// Adaptador SQLite (puerto EjecutorSql) — ADR-0017
export * from "./sqlite/ejecutor-sql.js";
export * from "./sqlite/esquema.js";
export * from "./sqlite/mapeo.js";
export * from "./sqlite/repositorios-sqlite.js";
