import { describe, expect, it, vi } from 'vitest';

import {
  avisoDeMigracionesPendientes,
  buscarMigracionesPendientes,
  migracionesPendientes,
} from './migraciones-pendientes';

const EN_DISCO = [
  '20260902160000_arqueo_con_ventas_sin_sincronizar',
  '20260903180000_nota_de_debito',
  '20260904150000_desglose_iva_congelado',
  '20260907120000_numero_fiscal_solo_con_cae',
];

describe('migracionesPendientes', () => {
  it('con todo aplicado no hay nada pendiente', () => {
    expect(migracionesPendientes(EN_DISCO, EN_DISCO)).toEqual([]);
  });

  it('devuelve lo que está en disco y no en la base, en orden', () => {
    expect(migracionesPendientes(EN_DISCO, [EN_DISCO[0]!, EN_DISCO[2]!])).toEqual([
      '20260903180000_nota_de_debito',
      '20260907120000_numero_fiscal_solo_con_cae',
    ]);
  });

  /**
   * Una base puede tener migraciones que este código ya no trae: pasa al volver
   * a una versión anterior del servidor. No es lo mismo que faltar, y no se
   * avisa — el aviso es para lo que falta correr.
   */
  it('una migración en la base que ya no está en disco no cuenta como pendiente', () => {
    expect(migracionesPendientes([EN_DISCO[0]!], EN_DISCO)).toEqual([]);
  });

  it('sin nada en disco no inventa pendientes', () => {
    expect(migracionesPendientes([], EN_DISCO)).toEqual([]);
  });
});

describe('avisoDeMigracionesPendientes', () => {
  it('dice cuántas son, cuáles, qué se rompe y cómo se arregla', () => {
    const texto = avisoDeMigracionesPendientes(EN_DISCO);

    expect(texto).toContain('4 migración(es) sin aplicar');
    expect(texto).toContain('20260904150000_desglose_iva_congelado');
    // Los dos síntomas que costó cinco días relacionar con esto.
    expect(texto).toContain('Internal server error');
    expect(texto).toContain('reportes');
    expect(texto).toContain('prisma migrate deploy');
  });
});

describe('buscarMigracionesPendientes', () => {
  /**
   * Es un aviso, no un guardián: si la consulta falla —base recién creada sin
   * la tabla de control, permisos, lo que sea— el arranque sigue como si nada.
   */
  it('si no se puede consultar la base, no avisa ni rompe', async () => {
    const prisma = { $queryRawUnsafe: vi.fn().mockRejectedValue(new Error('no existe la tabla')) };

    await expect(buscarMigracionesPendientes(prisma, __dirname)).resolves.toEqual([]);
  });

  it('sin carpeta de migraciones ni siquiera consulta', async () => {
    const prisma = { $queryRawUnsafe: vi.fn() };

    await expect(
      buscarMigracionesPendientes(prisma, 'C:/no/existe/esta/carpeta'),
    ).resolves.toEqual([]);
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
