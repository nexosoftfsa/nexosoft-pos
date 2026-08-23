import { describe, it, expect, beforeEach } from 'vitest';
import { RevisionClavesService } from './revision-claves.service';

const ADMIN = { id: 'u1', email: 'admin@lagus.com', rol: 'ADMIN' };
const CAJERA = { id: 'u2', email: 'marta@lagus.com', rol: 'CAJERO' };

describe('RevisionClavesService', () => {
  let service: RevisionClavesService;

  beforeEach(() => {
    service = new RevisionClavesService();
  });

  it('arranca sin nada revisado', () => {
    expect(service.listar()).toEqual([]);
    expect(service.deUsuario('u1')).toBeNull();
  });

  it('anota al usuario que entró con una contraseña débil', () => {
    service.revisar(ADMIN, 'Abcd1234');

    const debiles = service.listar();
    expect(debiles).toHaveLength(1);
    expect(debiles[0]?.email).toBe('admin@lagus.com');
    expect(debiles[0]?.rol).toBe('ADMIN');
    expect(debiles[0]?.motivo).toContain('menos de 12');
  });

  it('nunca guarda la contraseña, sólo el veredicto', () => {
    service.revisar(ADMIN, 'Abcd1234');
    expect(JSON.stringify(service.listar())).not.toContain('Abcd1234');
  });

  it('no anota a quien tiene una contraseña fuerte', () => {
    service.revisar(ADMIN, 'Melon-Tractor-92');
    expect(service.listar()).toEqual([]);
  });

  it('lo saca de la lista cuando vuelve a entrar con una contraseña buena', () => {
    service.revisar(ADMIN, 'Abcd1234');
    expect(service.listar()).toHaveLength(1);

    service.revisar(ADMIN, 'Melon-Tractor-92');
    expect(service.listar()).toEqual([]);
  });

  it('usa el nombre del comercio para detectar la contraseña más típica', () => {
    service.revisar(ADMIN, 'lagus2026lagus', { nombreComercio: 'Lagus' });
    expect(service.deUsuario('u1')?.motivo).toContain('nombre del comercio');
  });

  it('también vigila a los cajeros: con el panel expuesto, su token llega igual a la API', () => {
    service.revisar(CAJERA, 'marta123');
    expect(service.deUsuario('u2')).not.toBeNull();
  });

  it('no duplica al mismo usuario si entra varias veces', () => {
    service.revisar(ADMIN, 'Abcd1234');
    service.revisar(ADMIN, 'Abcd1234');
    expect(service.listar()).toHaveLength(1);
  });

  it('olvidar lo saca de la lista', () => {
    service.revisar(ADMIN, 'Abcd1234');
    service.olvidar('u1');
    expect(service.listar()).toEqual([]);
  });
});
