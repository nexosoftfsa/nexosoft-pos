/**
 * Modal reusable de "Importar desde Excel" (Fase 14.A): elegir archivo →
 * vista previa (dry-run, no persiste nada) → confirmar → resumen final.
 * Pensado para reusarse tal cual en los 5 módulos de datos maestros
 * (Catálogo, Proveedores, Stock, Medios de pago, Usuarios) — cada pantalla
 * solo pasa su propio `onImportar` (que llama al endpoint bulk del
 * cloud-api que corresponda) y la lista de columnas esperadas para el
 * texto de ayuda.
 */
import { useState } from "react";
import { elegirYLeerExcel } from "../importar-excel";
import type { FilaImportacion } from "../sync/importacion";
import { mensajeColumnasFaltantes, normalizarFilas, revisarColumnas } from "./columnas-importacion";

interface Props {
  readonly titulo: string;
  /** Nombres de columna esperados (mostrados como ayuda, ej. "Código de barras, Descripción, …"). */
  readonly columnasAyuda: readonly string[];
  /**
   * Las que SÍ o SÍ tienen que estar. Si falta alguna, se corta antes de
   * mandar nada al servidor. Por defecto, la primera de `columnasAyuda`: en
   * los cinco importadores esa es la clave (código, id, etc.).
   */
  readonly columnasRequeridas?: readonly string[];
  readonly onImportar: (
    filas: readonly Record<string, string>[],
    dryRun: boolean,
  ) => Promise<readonly FilaImportacion[]>;
  readonly onCerrar: () => void;
  /** Se llama una sola vez, después de confirmar de verdad (para refrescar la lista de la pantalla). */
  readonly onImportado: () => void;
}

type Estado =
  | { readonly paso: "elegir" }
  | { readonly paso: "cargando" }
  | {
      readonly paso: "preview";
      readonly archivo: string;
      readonly filas: readonly Record<string, string>[];
      readonly resultados: readonly FilaImportacion[];
    }
  | { readonly paso: "confirmando" }
  | { readonly paso: "hecho"; readonly resultados: readonly FilaImportacion[] }
  | { readonly paso: "error"; readonly mensaje: string };

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ModalImportacion({
  titulo,
  columnasAyuda,
  columnasRequeridas = columnasAyuda.slice(0, 1),
  onImportar,
  onCerrar,
  onImportado,
}: Props) {
  const [estado, setEstado] = useState<Estado>({ paso: "elegir" });

  async function elegirArchivo() {
    setEstado({ paso: "cargando" });
    try {
      const leido = await elegirYLeerExcel();
      if (leido === null) {
        setEstado({ paso: "elegir" });
        return;
      }
      if (leido.filas.length === 0) {
        setEstado({ paso: "error", mensaje: `"${leido.nombreArchivo}" no tiene filas de datos.` });
        return;
      }

      // Revisar las columnas ANTES de mandar nada. Si falta la columna clave,
      // el servidor devolvería el mismo error repetido una vez por fila, sin
      // decir nunca cuál es el problema real (pasó con un archivo que no era
      // el export de artículos: 25 veces "Fila sin código").
      const { faltantes, equivalencias } = revisarColumnas(
        leido.encabezados,
        columnasAyuda,
        columnasRequeridas,
      );
      if (faltantes.length > 0) {
        setEstado({
          paso: "error",
          mensaje: mensajeColumnasFaltantes(leido.nombreArchivo, faltantes, leido.encabezados),
        });
        return;
      }
      // Deja los encabezados con el nombre exacto que espera el importador,
      // para que un archivo con otra capitalización o sin acentos funcione.
      const filas = normalizarFilas(leido.filas, equivalencias);

      const resultados = await onImportar(filas, true);
      setEstado({ paso: "preview", archivo: leido.nombreArchivo, filas, resultados });
    } catch (e) {
      setEstado({ paso: "error", mensaje: mensajeDeError(e) });
    }
  }

  async function confirmar() {
    if (estado.paso !== "preview") return;
    setEstado({ paso: "confirmando" });
    try {
      const resultados = await onImportar(estado.filas, false);
      setEstado({ paso: "hecho", resultados });
      onImportado();
    } catch (e) {
      setEstado({ paso: "error", mensaje: mensajeDeError(e) });
    }
  }

  return (
    <div className="modal modal--show" onClick={onCerrar}>
      <div className="modal__box" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <h3>{titulo}</h3>
          <button type="button" className="modal__x" onClick={onCerrar} aria-label="Cerrar">
            ×
          </button>
        </div>
        <div className="modal__body">
          {estado.paso === "elegir" && (
            <>
              <p className="muted">
                Elegí un archivo Excel (.xlsx) con estas columnas en la primera fila:{" "}
                {columnasAyuda.join(", ")}.
              </p>
              <button
                type="button"
                className="pill-btn pill-btn--primary"
                onClick={() => void elegirArchivo()}
              >
                Elegir archivo…
              </button>
            </>
          )}
          {estado.paso === "cargando" && <p className="muted">Leyendo archivo…</p>}
          {estado.paso === "preview" && (
            <ResumenFilas resultados={estado.resultados} dryRun archivo={estado.archivo} />
          )}
          {estado.paso === "confirmando" && <p className="muted">Importando…</p>}
          {estado.paso === "hecho" && (
            <ResumenFilas resultados={estado.resultados} dryRun={false} />
          )}
          {estado.paso === "error" && <div className="error">{estado.mensaje}</div>}
        </div>
        <div className="modal__foot">
          {estado.paso === "preview" && (
            <>
              <button
                type="button"
                className="pill-btn"
                onClick={() => setEstado({ paso: "elegir" })}
              >
                Elegir otro archivo
              </button>
              <button
                type="button"
                className="pill-btn pill-btn--primary"
                onClick={() => void confirmar()}
              >
                Confirmar importación
              </button>
            </>
          )}
          {estado.paso === "hecho" && (
            <button type="button" className="pill-btn pill-btn--primary" onClick={onCerrar}>
              Cerrar
            </button>
          )}
          {(estado.paso === "elegir" || estado.paso === "error") && (
            <button type="button" className="pill-btn" onClick={onCerrar}>
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResumenFilas({
  resultados,
  dryRun,
  archivo,
}: {
  readonly resultados: readonly FilaImportacion[];
  readonly dryRun: boolean;
  readonly archivo?: string;
}) {
  const creadas = resultados.filter((r) => r.resultado === "creada").length;
  const omitidas = resultados.filter((r) => r.resultado === "omitida").length;
  const errores = resultados.filter((r) => r.resultado === "error");
  const advertencias = resultados.filter((r) => r.advertencia !== undefined);

  return (
    <div>
      {archivo !== undefined && <p className="muted">{archivo}</p>}
      <p>
        {dryRun ? "Se importarían" : "Se importaron"}: <strong>{creadas}</strong> nuevas
        {omitidas > 0 && (
          <>
            {" "}
            · <strong>{omitidas}</strong> ya existían (se omiten)
          </>
        )}
        {errores.length > 0 && (
          <>
            {" "}
            · <strong>{errores.length}</strong> con error
          </>
        )}
      </p>
      {dryRun && creadas === 0 && errores.length === 0 && omitidas > 0 && (
        <p className="muted">Todas las filas ya existían — no hay nada nuevo para importar.</p>
      )}
      {errores.length > 0 && (
        <div className="error">
          {errores.slice(0, 30).map((e) => (
            <div key={e.fila}>
              Fila {e.fila}: {e.mensaje}
            </div>
          ))}
          {errores.length > 30 && <div>… y {errores.length - 30} más.</div>}
        </div>
      )}
      {advertencias.length > 0 && (
        <div className="muted">
          {advertencias.slice(0, 10).map((a) => (
            <div key={a.fila}>
              Fila {a.fila}: {a.advertencia}
            </div>
          ))}
          {advertencias.length > 10 && <div>… y {advertencias.length - 10} advertencias más.</div>}
        </div>
      )}
    </div>
  );
}
