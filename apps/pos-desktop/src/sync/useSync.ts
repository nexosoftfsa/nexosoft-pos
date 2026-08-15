import { useCallback, useEffect, useState } from "react";

import type { AlmacenDeOperaciones, MotorDeSincronizacion, OperacionSync } from "@nexosoft/sync";

/** Lo que el POS inyecta para la sincronización. */
export interface SyncPos {
  readonly motor: MotorDeSincronizacion;
  readonly almacen: AlmacenDeOperaciones;
  readonly terminalId: string;
}

export interface EstadoSync {
  readonly pendientes: number;
  readonly fallidas: number;
  readonly sincronizando: boolean;
  readonly online: boolean;
  readonly error: string | null;
  readonly encolar: (op: OperacionSync) => Promise<void>;
  readonly sincronizarAhora: () => Promise<void>;
  /** Reactiva las operaciones `fallida` (agotaron los reintentos automáticos) y sincroniza. Acción manual (botón). */
  readonly reintentarFallidasYSincronizar: () => Promise<void>;
}

const INTERVALO_MS = 15_000;

/**
 * Orquesta la cola de sync para la UI: cuenta pendientes/fallidas, sincroniza al
 * volver la conexión y cada cierto intervalo, y expone `encolar` (que dispara un
 * intento inmediato). La lógica pesada vive en `MotorDeSincronizacion`.
 */
export function useSync(sync: SyncPos): EstadoSync {
  const { motor, almacen } = sync;
  const [pendientes, setPendientes] = useState(0);
  const [fallidas, setFallidas] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [error, setError] = useState<string | null>(null);

  const refrescar = useCallback(async () => {
    const todas = await almacen.todas();
    setPendientes(todas.filter((o) => o.estado === "pendiente" || o.estado === "enviando").length);
    setFallidas(todas.filter((o) => o.estado === "fallida").length);
  }, [almacen]);

  const sincronizarAhora = useCallback(async () => {
    if (!navigator.onLine) return;
    setSincronizando(true);
    setError(null);
    try {
      await motor.sincronizar();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSincronizando(false);
      await refrescar();
    }
  }, [motor, refrescar]);

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
    sincronizando,
    online,
    error,
    encolar,
    sincronizarAhora,
    reintentarFallidasYSincronizar,
  };
}
