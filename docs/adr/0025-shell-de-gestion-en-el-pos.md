# ADR-0025: Shell de gestión en el POS (menú lateral + identidad de la maqueta)

- **Estado:** Aceptada
- **Fecha:** 2026-06-28
- **Decisores:** Equipo NexoSoft (decisión del usuario)
- **Relacionada:** ADR-0019 (servidor de sucursal en LAN), ADR-0024 (panel web de
  reportes), roadmap `docs/roadmap-fase-7-gestion.md`

## Contexto

La app nativa (Tauri) solo tenía Login, selección de terminal, **Ventas** y
Config. El usuario pidió que el POS sea un **sistema de gestión completo** —
catálogo, stock, caja, cuentas corrientes, comprobantes, reportes— con la
**misma interfaz visual** de la maqueta (`prototipo/`), que ya tiene un shell
pensado (menú lateral por secciones, barra superior, responsive).

La Fase 7 ataca eso por sub-fases. La **7.1** es la base: el shell donde van a
vivir todos los módulos. Sin una navegación y una identidad visual comunes, cada
módulo siguiente sería una isla.

## Decisión

1. **Shell propio en React** (`apps/pos-desktop/src/shell/`) que porta la
   identidad visual de la maqueta (paleta navy/teal, logo, sidebar, topbar,
   cajón responsive). Se reusa el **CSS de la maqueta** como referencia, no su
   JS (la maqueta no tiene lógica real).
2. **Registro de módulos declarativo** (`modulos.tsx`): id, título, migaja,
   sección, ícono, roles y badges. El menú se arma a partir de esta lista; cada
   sub-fase reemplaza un placeholder por su pantalla real. Hoy solo **Punto de
   Venta** es real; el resto son placeholders ("Próximamente").
3. **Gateo del menú por rol** (decisión del usuario): el cajero ve solo
   Operación (Inicio, Ventas, Caja); ADMIN/SUPERVISOR ven todo. Es **UX**: el
   backend sigue imponiendo permisos en sus endpoints (`RolesGuard`, ADR-0024).
   El rol se lee del claim `rol` del JWT (igual que el panel web).
4. **ABM de gestión online** (decisión del usuario): los módulos de
   administración (catálogo, stock, caja) operarán contra el servidor de
   sucursal en la LAN. **Vender sigue offline-first**; la administración no
   necesita cola de sync propia (una sola fuente de verdad, menos complejidad).
5. **El módulo "Asistente IA" queda en el menú** (decisión del usuario) como
   placeholder, hasta integrar Gemini real (OCR + métricas) en una fase propia.
6. **Configuración se resuelve fuera del shell**: el ítem del menú reabre la
   fase de config del `App`, que persiste los cambios y reinicializa el entorno
   (toma nueva URL del servidor, reconstruye el cliente). Se evita duplicar ese
   flujo dentro del shell.
7. **La sincronización se orquesta una sola vez** en el shell (`useSync`) y el
   estado se baja como prop a la pantalla de Ventas. Antes, Ventas tenía su
   propia barra y su propio `useSync`; al mover Ventas dentro del shell, esas
   responsabilidades (indicador de sync, datos del comercio, terminal, salir)
   subieron al topbar/sidebar para no duplicar motores de sync.

## Consecuencias

### Positivas

- Base común para todos los módulos de la Fase 7: navegación, identidad visual
  y gateo por rol resueltos una vez.
- El POS pasa de "pantalla de ventas" a "aplicación de gestión", como pidió el
  usuario, sin tocar la lógica de dominio (ventas, precios, IVA intactos).
- El shell se ve en el navegador de desarrollo (como ADMIN), así que cada módulo
  futuro se puede verificar visualmente sin compilar Tauri.

### Negativas / costos

- El menú muestra varios placeholders hasta que las sub-fases los completen
  (mitigado: el placeholder comunica "Próximamente" y la fase en curso).
- El gateo por rol es solo de presentación; la seguridad real vive en el backend
  (asumido y documentado).

## Alternativas consideradas

- **Mostrar todo a todos (sin gatear por rol)** — descartado por el usuario: un
  cajero no debería ver catálogo/reportes/config en el menú.
- **ABM también offline con cola de sync** — descartado: mucho más complejo
  (conflictos, doble fuente de verdad) sin valor para el MVP de una sucursal con
  el servidor en la LAN.
- **Router (react-router) en vez de estado local** — innecesario por ahora: el
  shell maneja un módulo activo con `useState`; no hay deep-linking ni URLs que
  preservar en una app de escritorio. Se puede migrar si hace falta.
