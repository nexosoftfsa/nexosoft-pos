# ADR-0003: Cliente POS de escritorio con Tauri 2

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

El POS necesita acceso nativo a periféricos (impresoras ESC/POS, balanzas,
lectores) por USB/serial, operar offline y tener buen rendimiento en hardware
modesto de mostrador.

## Decisión

Cliente de escritorio con **Tauri 2 + React + TypeScript + Vite**. El acceso a
USB/serial y al filesystem se hace desde la capa nativa (Rust) expuesta a la UI
vía comandos/IPC.

## Consecuencias

### Positivas
- Footprint chico y bajo consumo de memoria vs. Electron.
- Acceso nativo a hardware y a SQLite local.
- UI web (React) reutilizable y rápida de desarrollar.

### Negativas / costos
- **Requiere la toolchain de Rust, que NO está instalada en este entorno**
  (`rustup` + Build Tools de C++ + WebView2 en Windows). Es el principal
  riesgo/prerequisito.
- Ecosistema de librerías de hardware en Rust menos maduro que en Node; puede
  hacer falta escribir adaptadores serial/USB propios.

## Alternativas consideradas

- **Electron** — ecosistema Node más maduro para hardware (p. ej. `serialport`,
  `node-escpos`) y sin necesidad de Rust, pero footprint mucho mayor. **Plan B**
  si la madurez de librerías de hardware en Rust se vuelve un bloqueo.
- **Web/PWA pura** — WebUSB/WebSerial son limitados y poco confiables para POS
  de producción; descartada como cliente principal.
