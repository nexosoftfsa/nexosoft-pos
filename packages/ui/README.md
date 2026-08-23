# @nexosoft/ui

Componentes de UI compartidos por el cliente POS (y, a futuro, un panel web).

- Base **shadcn/ui + Tailwind**, componentes **accesibles**.
- POS pensado para **teclado** (atajos, foco visible) y **alto contraste** para
  uso intensivo en mostrador.
- Sin lógica de negocio: sólo presentación (la lógica vive en `@nexosoft/domain`).

> Estado: scaffold. Los componentes se agregan a medida que avanzan las fases.
> En los hechos el POS terminó con sus componentes propios en
> `apps/pos-desktop/src/componentes/`, así que este paquete sigue vacío.
>
> Por eso su script de `test` corre con `--passWithNoTests`: sin eso vitest
> sale con código 1 al no encontrar ningún test y **hace fallar el `pnpm test`
> de todo el monorepo**. Cuando el paquete tenga componentes de verdad, van
> con sus tests y el flag deja de hacer falta.
