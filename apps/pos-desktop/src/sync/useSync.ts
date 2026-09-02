import { useCallback, useEffect, useState } from "react";

import type {
  AlmacenDeOperaciones,
  ComprobanteResuelto,
  MotorDeSincronizacion,
  OperacionEnCola,
  OperacionSync,
} from "@nexosoft/sync";

import type { RepositorioVentas } from "@nexosoft/app";

import { esperarConTope } from "./esperar-con-tope";
import { volcarComprobantes } from "./volcar-comprobantes";

/** Lo que el POS inyecta para la sincronización. */
export interface SyncPos {
  readonly motor: MotorDeSincronizacion;
  readonly almacen: AlmacenDeOperaciones;
  readonly terminalId: string;
  /**
   * Ventas guardadas en esta terminal. Cuando el servidor resuelve una venta
   * —le da el número de ARCA y el CAE— eso se vuelca sobre la copia local, así
   * el comprobante se puede ver y reimprimir bien aunque después no haya red.
   * Opcional: en la demo del navegador no hay base local.
   */
  readonly ventasLocales?: RepositorioVentas;
}

export interface EstadoSync {
  readonly pendientes: number;
  readonly fallidas: number;
  /**
   * Las operaciones rechazadas, con el motivo que devolvió el servidor. El
   * contador solo no alcanza: una venta que no sincroniza necesita decir POR
   * QUÉ, si no queda enterrada en la cola y el comercio se entera cuando le
   * faltan ventas en los reportes.
   */
  readonly detalleFallidas: readonly OperacionEnCola[];
  readonly sincronizando: boolean;
  readonly online: boolean;
  readonly error: string | null;
  readonly encolar: (op: OperacionSync) => Promise<void>;
  /**
   * Encola y espera —hasta `esperaMs`— a que el servidor resuelva el
   * comprobante, para poder imprimir el ticket con el CAE y el número de ARCA.
   *
   * Si no contesta a tiempo devuelve `null` y **la operación sigue su curso en
   * la cola**: no se cancela nada. El ticket sale como "pendiente" y el CAE se
   * consigue después, que es la garantía de siempre. Lo único que se acota es
   * cuánto espera la caja con el cliente adelante.
   */
  readonly encolarYEsperarComprobante: (
    op: OperacionSync,
    esperaMs?: number,
  ) => Promise<ComprobanteResuelto | null>;
  readonly sincronizarAhora: () => Promise<void>;
  /** Reactiva las operaciones `fallida` (agotaron los reintentos automáticos) y sincroniza. Acción manual (botón). */
  readonly reintentarFallidasYSincronizar: () => Promise<void>;
  /**
   * Saca de la cola las operaciones que no pueden entrar nunca. Acción manual y
   * deliberada: no borra ventas, pero sí el intento de subirlas.
   */
  readonly descartarFallidas: () => Promise<number>;
}

const INTERVALO_MS = 15_000;

/**
 * Cuánto espera la caja a que ARCA conteste antes de imprimir el ticket.
 *
 * Es un compromiso: con ARCA respondiendo normal, el ticket sale con CAE y QR
 * (que es como tiene que salir). Con ARCA lenta o caída, el cajero no se queda
 * mirando la pantalla con el cliente adelante — sale el ticket "pendiente" y el
 * CAE se consigue solo.
 *
 * Una venta normal se resuelve en 1 a 3 segundos (dos llamadas a ARCA; el
 * ticket de acceso está cacheado). Si a los 5 no contestó, ya está degradada y
 * esperar más sólo hace más larga la cola: el servidor igual sigue intentando
 * por su cuenta hasta los 20 segundos que tiene de tope.
 */
const ESPERA_COMPROBANTE_MS = 5_000;

/**
 * Orquesta la cola de sync para la UI: cuenta pendientes/fallidas, sincroniza al
 * volver la conexión y cada cierto intervalo, y expone `encolar` (que dispara un
 * intento inmediato). La lógica pesada vive en `MotorDeSincronizacion`.
 */
export function useSync(sync: SyncPos): EstadoSync {
  const { motor, almacen, ventasLocales } = sync;
  const [pendientes, setPendientes] = useState(0);
  const [fallidas, setFallidas] = useState(0);
  const [detalleFallidas, setDetalleFallidas] = useState<readonly OperacionEnCola[]>([]);
  const [sincronizando, setSincronizando] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    const todas = await almacen.todas();
    setPendientes(todas.filter((o) => o.estado === "pendiente" || o.estado === "enviando").length);
    const rechazadas = todas.filter((o) => o.estado === "fallida");
    setFallidas(rechazadas.length);
    setDetalleFallidas(rechazadas);
  }, [almacen]);

  /**
   * Corre la sincronización y le vuelca a la base local lo que el servidor
   * resolvió. Que falle el volcado no puede tumbar la corrida: la venta ya está
   * en el servidor, que es lo que importa.
   */
  const sincronizarYVolcar = useCallback(async () => {
    const resumen = await motor.sincronizar();
    if (ventasLocales !== undefined) {
      try {
        await volcarComprobantes(ventasLocales, resumen.resultados);
      } catch (e) {
        console.error("No se pudo actualizar la copia local de los comprobantes:", e);
      }
    }
    return resumen;
  }, [motor, ventasLocales]);

  const sincronizarAhora = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    setError(null);
    try {
      await sincronizarYVolcar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
      await refrescar();
    }
  }, [sincronizarYVolcar, refrescar]);

  const encolar = useCallback(
    async (op: OperacionSync) => {
      await motor.encolar(op);
      await refrescar();
      void sincronizarAhora();
    },
    [motor, refrescar, sincronizarAhora],
  );

  const reintentarFallidasYSincronizar = useCallback(async () => {
    await almacen.reintentarFallidas();
    await sincronizarAhora();
  }, [almacen, sincronizarAhora]);

  const encolarYEsperarComprobante = useCallback(
    async (op: OperacionSync, esperaMs = ESPERA_COMPROBANTE_MS) => {
      await motor.encolar(op);
      await refrescar();
      if (!navigator.onLine) return null;

      // La sincronización NO se cancela si se agota la espera: sigue su curso y
      // el CAE se consigue igual. Sólo se deja de esperar.
      const corrida = sincronizarYVolcar()
        .then((r) => r.resultados[op.operacionId] ?? null)
        .catch(() => null);

      const aTiempo = await esperarConTope(corrida, esperaMs);
      void corrida.finally(() => void refrescar());

      return aTiempo !== null && aTiempo.ok ? (aTiempo.comprobante ?? null) : null;
    },
    [motor, refrescar, sincronizarYVolcar],
  );

  const descartarFallidas = useCallback(async () => {
    const n = await almacen.descartarFallidas();
    await refrescar();
    return n;
  }, [almacen, refrescar]);

  useEffect(() => {
    const alConectar = () => {
      setOnline(true);
      void sincronizarAhora();
    };
    const alDesconectar = () => setOnline(false);
    window.addEventListener("online", alConectar);
    window.addEventListener("offline", alDesconectar);
    return () => {
      window.removeEventListener("online", alConectar);
      window.removeEventListener("offline", alDesconectar);
    };
  }, [sincronizarAhora]);

  useEffect(() => {
    void refrescar();
    const id = setInterval(() => void sincronizarAhora(), INTERVALO_MS);
    return () => clearInterval(id);
  }, [refrescar, sincronizarAhora]);

  return {
    pendientes,
    fallidas,
    detalleFallidas,
    sincronizando,
    online,
    error,
    encolar,
    encolarYEsperarComprobante,
    sincronizarAhora,
    reintentarFallidasYSincronizar,
    descartarFallidas,
  };
}
