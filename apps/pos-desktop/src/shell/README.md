# Shell del POS (Fase 7.1)

Cáscara de la aplicación de gestión: **menú lateral + barra superior + área de
contenido**, con la identidad visual de la maqueta (`prototipo/`). Es la base
sobre la que se montan todos los módulos de la Fase 7. Ver
[ADR-0025](../../../../docs/adr/0025-shell-de-gestion-en-el-pos.md) y el roadmap
en `docs/roadmap-fase-7-gestion.md`.

## Piezas

| Archivo | Qué hace |
| ------- | -------- |
| `Shell.tsx` | Layout: sidebar (marca + nav + usuario) + topbar (título/migaja + estado) + contenido. Orquesta la cola de sync (`useSync`) y la baja a Ventas. Maneja el módulo activo y el cajón responsive. |
| `modulos.tsx` | Registro declarativo de módulos (id, título, sección, ícono, roles, badge) y reglas de visibilidad por rol. **Lógica pura, testeada.** |
| `modulos.test.ts` | Tests del gateo por rol y del módulo inicial. |
| `iconos.tsx` | Íconos SVG del menú, portados de la maqueta. |
| `Placeholder.tsx` | Pantalla "Próximamente" para los módulos aún no implementados. |
| `shell.css` | Estilos del shell (paleta navy/teal de la maqueta). Se carga **después** de `estilos.css` y reasigna los acentos del POS para que todo armonice. |

## Módulos y roles

El menú se arma desde `MODULOS`. Cada módulo declara qué roles lo ven; el resto
no lo ve en el menú (gateo de **presentación** — el backend igual impone permisos
con su `RolesGuard`).

| Sección | Módulos | Roles | Estado |
| ------- | ------- | ----- | ------ |
| Operación | Inicio · Punto de Venta · Caja y Tesorería | todos | Ventas ✅, resto placeholder |
| Gestión | Catálogo · Stock · Cuentas Corrientes | ADMIN, SUPERVISOR | placeholder |
| Inteligencia | Reportes · Asistente IA | ADMIN, SUPERVISOR | placeholder |
| Sistema | Configuración | ADMIN, SUPERVISOR | reabre la fase de config del `App` |

Un rol desconocido o ausente cae al **menor privilegio** (CAJERO). El rol se lee
del claim `rol` del JWT (`SesionManager.rol`). En el navegador de desarrollo no
hay login: el shell se monta como **ADMIN** para poder ver todo.

## Cómo se agrega un módulo real (sub-fases siguientes)

1. Crear el componente del módulo en `componentes/` (o una carpeta propia).
2. En `Shell.tsx`, renderizar ese componente cuando `activo?.id === "<id>"` (hoy
   solo `pos` tiene pantalla real; el resto cae a `Placeholder`).
3. Si cambia algún dato declarativo (título, roles), ajustar `MODULOS`.

La pantalla de **Ventas** (`componentes/PantallaPos.tsx`) ya vive dentro del
shell: recibe `entorno` y el `sync` (estado de la cola) como props; ya no tiene
barra propia.
