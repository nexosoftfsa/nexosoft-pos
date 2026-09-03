import { describe, it, expect, vi, beforeEach } from "vitest";
import { AlmacenEnMemoria } from "./almacen-en-memoria";
import { MotorDeSincronizacion, mensajeDeTransporte } from "./motor-de-sincronizacion";
import type { ClienteDeSync } from "./cliente-de-sync";
import type { OperacionSync, ResultadoEnvio } from "./tipos";

function op(operacionId: string): OperacionSync {
  return {
    operacionId,
    tipo: "venta",
    payload: { total: "100" },
    terminalId: "t1",
    creadaEn: "2026-06-26T10:00:00.000Z",
  };
}

describe("AlmacenEnMemoria", () => {
  it("encola una operación como pendiente", async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.encolar(op("op-1"));

    const pendientes = await almacen.pendientes();
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0]?.estado).toBe("pendiente");
    expect(pendientes[0]?.intentos).toBe(0);
  });

  it("es idempotente: no re-encola un operacionId ya conocido", async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.encolar(op("op-1"));
    await almacen.marcar("op-1", "completada");
    await almacen.encolar(op("op-1")); // reintento de encolar

    const todas = await almacen.todas();
    expect(todas).toHaveLength(1);
    expect(todas[0]?.estado).toBe("completada"); // no se pisó
  });

  it("reintentarFallidas vuelve a pendiente solo las fallidas, resetea intentos y limpia el error", async () => {
    const almacen = new AlmacenEnMemoria();
    await almacen.encolar(op("op-1"));
    await almacen.encolar(op("op-2"));
    await almacen.marcar("op-1", "fallida", { intentos: 5, ultimoError: "Sync HTTP 401" });
    await almacen.marcar("op-2", "completada");

    const n = await almacen.reintentarFallidas();

    expect(n).toBe(1);
    const op1 = await almacen.obtener("op-1");
    expect(op1?.estado).toBe("pendiente");
    expect(op1?.intentos).toBe(0);
    expect(op1?.ultimoError).toBeUndefined();
    expect((await almacen.obtener("op-2"))?.estado).toBe("completada");
  });
});

describe("MotorDeSincronizacion", () => {
  let almacen: AlmacenEnMemoria;
  let cliente: { enviar: ReturnType<typeof vi.fn> };
  let motor: MotorDeSincronizacion;

  beforeEach(() => {
    almacen = new AlmacenEnMemoria();
    cliente = { enviar: vi.fn() };
    motor = new MotorDeSincronizacion(almacen, cliente as ClienteDeSync, { maxIntentos: 2 });
  });

  it("sin pendientes devuelve un resumen vacío", async () => {
    const resumen = await motor.sincronizar();
    expect(resumen).toEqual({ enviadas: 0, completadas: 0, fallidas: 0, pendientes: 0, resultados: {} });
    expect(cliente.enviar).not.toHaveBeenCalled();
  });

  it("marca completadas las operaciones aceptadas por el servidor", async () => {
    await motor.encolar(op("op-1"));
    await motor.encolar(op("op-2"));
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: true },
      "op-2": { ok: true, idRemoto: "v-99" },
    } satisfies Record<string, ResultadoEnvio>);

    const resumen = await motor.sincronizar();

    expect(resumen).toEqual({
      enviadas: 2,
      completadas: 2,
      fallidas: 0,
      pendientes: 0,
      // Se devuelven para que quien encolo pueda imprimir el ticket con el CAE
      // y el numero que asigno ARCA.
      resultados: { 'op-1': { ok: true }, 'op-2': { ok: true, idRemoto: 'v-99' } },
    });
    expect((await almacen.obtener("op-1"))?.estado).toBe("completada");
    expect(await almacen.pendientes()).toHaveLength(0);
  });

  it("deja en pendiente (con intento++) un error reintentable", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: false, error: "timeout", reintentable: true },
    } satisfies Record<string, ResultadoEnvio>);

    const resumen = await motor.sincronizar();

    expect(resumen.pendientes).toBe(1);
    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("pendiente");
    expect(o?.intentos).toBe(1);
    expect(o?.ultimoError).toBe("timeout");
  });

  it("marca fallida al superar maxIntentos", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: false, error: "timeout", reintentable: true },
    } satisfies Record<string, ResultadoEnvio>);

    await motor.sincronizar(); // intento 1 -> pendiente
    await motor.sincronizar(); // intento 2 -> fallida (maxIntentos=2)

    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("fallida");
    expect(o?.intentos).toBe(2);
  });

  it("marca fallida de inmediato un error NO reintentable", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: false, error: "payload inválido", reintentable: false },
    } satisfies Record<string, ResultadoEnvio>);

    const resumen = await motor.sincronizar();

    expect(resumen.fallidas).toBe(1);
    expect((await almacen.obtener("op-1"))?.estado).toBe("fallida");
  });

  it("si el transporte falla (sin red), deja todo pendiente para reintentar", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockRejectedValue(new Error("ECONNREFUSED"));

    const resumen = await motor.sincronizar();

    expect(resumen.pendientes).toBe(1);
    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("pendiente");
    expect(o?.ultimoError).toContain("ECONNREFUSED");
  });

  /**
   * Pasó en campo: con el servidor inalcanzable un par de minutos, la venta
   * agotó los reintentos (uno cada 15s) y quedó "con error", obligando al
   * cajero a apretar "Reintentar" por una caída de red que se resolvió sola.
   */
  it("un corte de red no agota los reintentos, por largo que sea", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockRejectedValue(new TypeError("Failed to fetch"));

    // El tope de este motor es 2; con diez cortes seguidos deberia haber
    // fallado hace rato si el transporte contara.
    for (let i = 0; i < 10; i++) await motor.sincronizar();

    const o = await almacen.obtener("op-1");
    expect(o?.estado).toBe("pendiente");
    // Los intentos se siguen contando, para poder verlos en la pantalla.
    expect(o?.intentos).toBe(10);
  });

  it("apenas el servidor contesta, el tope vuelve a correr", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockRejectedValue(new TypeError("Failed to fetch"));
    await motor.sincronizar();
    expect((await almacen.obtener("op-1"))?.estado).toBe("pendiente");

    // Ahora si contesta, y rechaza de forma definitiva.
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: false, error: "producto inexistente", reintentable: false },
    } satisfies Record<string, ResultadoEnvio>);
    await motor.sincronizar();

    expect((await almacen.obtener("op-1"))?.estado).toBe("fallida");
  });

  it("trata como reintentable una operación sin resultado del servidor", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockResolvedValue({}); // el servidor no respondió por op-1

    const resumen = await motor.sincronizar();

    expect(resumen.pendientes).toBe(1);
    expect((await almacen.obtener("op-1"))?.estado).toBe("pendiente");
  });

  it("fallidas() lista las operaciones que agotaron reintentos", async () => {
    await motor.encolar(op("op-1"));
    cliente.enviar.mockResolvedValue({
      "op-1": { ok: false, error: "x", reintentable: false },
    } satisfies Record<string, ResultadoEnvio>);
    await motor.sincronizar();

    const fallidas = await motor.fallidas();
    expect(fallidas).toHaveLength(1);
    expect(fallidas[0]?.operacionId).toBe("op-1");
  });
});

/**
 * El texto que se guarda acá termina en la pantalla "Ventas que no llegaron al
 * servidor", que mira el dueño del comercio. Antes le llegaba "Failed to
 * fetch" tal cual, que no le dice nada a nadie.
 */
describe("mensajeDeTransporte", () => {
  it("traduce el fallo de conexión de fetch a algo accionable", () => {
    const r = mensajeDeTransporte(new TypeError("Failed to fetch"));

    expect(r).not.toContain("Failed to fetch");
    expect(r).toContain("encendida");
    expect(r).toContain("red");
  });

  it("conserva el mensaje de un error que sí dice algo útil", () => {
    expect(mensajeDeTransporte(new Error("HTTP 401 no autorizado"))).toContain(
      "HTTP 401 no autorizado",
    );
  });

  it("no deja el detalle vacío cuando no hay mensaje", () => {
    expect(mensajeDeTransporte(new Error(""))).toContain("transporte");
    expect(mensajeDeTransporte("algo raro")).toContain("transporte");
  });
});
