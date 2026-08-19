import { describe, it, expect, vi } from 'vitest';
import { HealthController } from './health.controller';

const mockPrisma = {
  $queryRaw: vi.fn(),
};

describe('HealthController', () => {
  const ctrl = new HealthController(mockPrisma as never);

  it('devuelve status ok cuando la DB responde', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const result = await ctrl.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('ok');
  });

  it('devuelve status degraded cuando la DB falla', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('connection refused'));
    const result = await ctrl.check();
    expect(result.status).toBe('degraded');
    expect(result.db).toBe('error');
  });

  it('incluye la version (dev si no hay archivo VERSION, como en tests)', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
    const result = await ctrl.check();
    expect(result.version).toBe('dev');
  });
});
