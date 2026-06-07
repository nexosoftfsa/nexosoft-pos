# Maqueta visual — NexoSoft

Prototipo **visual y navegable**, **sin funcionalidad real**, para mostrarle al
cliente cómo luce el sistema y la **distribución de los módulos** en una **tablet**.

> ⚠️ Esto NO es la aplicación final. La app real se construye en React + Tauri
> (ver `../apps/pos-desktop`). Esta maqueta es solo para validar diseño y layout.

## Cómo verla

- **Opción rápida:** doble clic en `index.html` (se abre en cualquier navegador).
- **En una tablet (misma red Wi-Fi):**
  ```bash
  node serve.js
  ```
  Después, en la tablet, abrí `http://<IP-de-tu-PC>:5173`.
  Tip: en la tablet conviene **modo horizontal (landscape)** y "Agregar a
  pantalla de inicio" para verla a pantalla completa.

## Pantallas incluidas

Login → y dentro de la app: **Inicio (dashboard), Punto de Venta, Caja y
Tesorería, Catálogo y Precios, Stock e Inventario, Cuentas Corrientes, Reportes,
Asistente IA y Configuración** (con el selector de condición fiscal RI/Monotributo).

La navegación entre módulos funciona (es presentación pura); los botones de
acción no ejecutan nada todavía.

## Tu logo

La maqueta usa un logo provisorio dibujado en código. Para ver el **logo real**:

1. Guardá tu archivo como `assets/logo.png` (idealmente cuadrado, fondo
   transparente o blanco).
2. Recargá la página. Si el archivo existe, se usa automáticamente; si no,
   se muestra el provisorio.

## Colores de marca usados

- Azul (navy): `#0E2C49`
- Turquesa (teal): `#1C97B0` → `#2FB4CE`
