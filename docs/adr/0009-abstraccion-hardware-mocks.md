# ADR-0009: Abstracción de hardware con puertos y mocks

- **Estado:** Aceptada
- **Fecha:** 2026-06-07

## Contexto

Hay que soportar impresoras térmicas ESC/POS, balanzas y lectores de varias
marcas/modelos, sobre USB/serial. El hardware **no se puede probar en este
entorno** y los modelos concretos aún no están definidos.

## Decisión

`@nexosoft/hardware` define **puertos** (`Impresora`, `Balanza`, `Lector`) y
provee **mocks funcionales**. Las implementaciones reales hablan USB/serial desde
la capa nativa de Tauri (Rust) y se inyectan en el POS.

## Consecuencias

### Positivas
- El POS no depende de un modelo concreto; agregar un driver no toca la UI.
- Desarrollo y tests sin hardware presente (mocks).
- Aísla el código nativo/serial del resto de la app.

### Negativas / costos
- Hay que implementar un adaptador por familia de protocolo (p. ej. ESC/POS, o
  el protocolo serial de cada balanza).
- Los detalles finos (corte de papel, cajón de dinero, formato de etiqueta)
  dependen del modelo real y se validan recién con el equipo físico.

## Alternativas consideradas

- **Hablar a los periféricos directo desde la UI** — no portable, no testeable.
- **Atarse a una sola marca** — limita al comercio; el diseño por puertos lo evita.
