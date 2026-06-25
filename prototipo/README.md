# Maqueta interactiva — NexoSoft

Prototipo **navegable, responsive y con funcionamiento de demostración** (del
lado del cliente, sin backend). Sirve para mostrarle al cliente cómo luce y se
usa el sistema en una **tablet o celular**, en cualquier orientación.

> ⚠️ No es la aplicación final. La app real se construye en React + Tauri
> (ver `../apps/pos-desktop`). Acá los datos viven en memoria + `localStorage`.

## Qué se puede hacer (demo funcional)

- **POS:** buscar/filtrar productos por rubro, agregar al ticket, cambiar
  cantidades, quitar ítems, elegir forma de pago, calcular **IVA y vuelto**, y
  **COBRAR** (genera comprobante con CAE simulado, descuenta stock y suma a caja).
- **Catálogo:** alta y edición de artículos, búsqueda, filtro por rubro y cambio
  de lista **minorista/mayorista** (recalcula precios y utilidad).
- **Stock:** ingreso por compra, ajuste manual, filtro de alertas.
- **Caja:** ingresos/egresos, arqueo y cierre/apertura de turno.
- **Cuentas corrientes:** registrar cobros y dar de alta clientes.
- **Reportes:** se recalculan según las ventas (formas de pago, comprobantes).
- **Configuración:** elegir condición fiscal **RI / Monotributo** → cambia el
  tipo de comprobante e IVA en el POS. Botón **Reiniciar demo**.
- **Inicio:** KPIs (ventas, comprobantes, ticket promedio, margen) calculados en
  vivo a partir de la actividad.

## Responsive

- **Escritorio / tablet horizontal:** barra lateral fija.
- **Tablet vertical / celular:** la barra lateral pasa a **menú hamburguesa**
  (cajón), el contenido se apila y las tablas se desplazan para no cortar datos.

## Cómo verla

- **Rápido:** doble clic en `index.html` (o `node serve.js` y abrir `http://localhost:5173`).
- **En una tablet/celular de tu red:** `node serve.js` y entrá desde el
  dispositivo a `http://<IP-de-tu-PC>:5173`.

## Mostrarla a un cliente fuera de tu red

### A) Un solo archivo portable (sin internet)
```bash
node build-standalone.js
```
Genera **`nexosoft-maqueta.html`** con TODO adentro (CSS + JS + logo). Mandalo por
WhatsApp / email / Drive y se abre en cualquier dispositivo, offline.

### B) Subirlo a un servidor (link público)
- **tiiny.host** — subís `nexosoft-maqueta.html` → link al instante.
- **Netlify Drop** (`app.netlify.com/drop`) — arrastrás la carpeta `prototipo/`.
- **GitHub Pages / Vercel / Cloudflare** — para algo permanente.

## Estructura

| Archivo | Qué es |
| --- | --- |
| `index.html` | Estructura (shell) de la interfaz |
| `styles.css` | Estilos y diseño responsive |
| `app.js` | Lógica de la demo (datos, POS, caja, etc.) |
| `build-standalone.js` | Genera el archivo único portable |
| `serve.js` | Servidor estático para ver desde otro dispositivo |
| `assets/logo.png` | Tu logo (reemplazable) |

## Tu logo

Está en `assets/logo.png`. Si lo cambiás, volvé a correr `node build-standalone.js`
para regenerar el archivo único con el logo nuevo embebido.
