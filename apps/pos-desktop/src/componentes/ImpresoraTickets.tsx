import { useEffect, useState } from "react";

import {
  configurarImpresora,
  listarImpresoras,
  nombreImpresoraConfigurada,
  type ImpresoraDelSistema,
} from "../datos/impresora-escpos";
import {
  avisoDeImpresora,
  bytesPruebaImpresion,
  etiquetaImpresora,
  IMPRESORA_PREDETERMINADA,
} from "./impresora-tickets-helpers";

/**
 * Elegir a qué impresora sale el ticket, y probarla.
 *
 * Antes no existía: el POS usaba siempre la predeterminada de Windows. En una
 * PC donde la predeterminada era "Microsoft Print to PDF", cada venta mandaba
 * los bytes ESC/POS a ese driver, que los guardaba crudos en un `.pdf` ilegible
 * — y como el spooler aceptaba todos los bytes, el POS daba la impresión por
 * buena. El cliente se iba sin ticket y nadie se enteraba.
 *
 * Por eso esta tarjeta hace tres cosas: deja elegir la impresora, avisa cuando
 * la elegida (o la predeterminada) es virtual, y ofrece una prueba que sale en
 * papel o falla con un mensaje.
 *
 * La elección es de la TERMINAL, no del comercio: cada caja tiene su impresora.
 * Por eso va a `localStorage` y no al servidor.
 */
export function ImpresoraTickets() {
  const [instaladas, setInstaladas] = useState<readonly ImpresoraDelSistema[]>([]);
  const [elegida, setElegida] = useState(nombreImpresoraConfigurada());
  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  useEffect(() => {
    let vigente = true;
    void (async () => {
      try {
        const lista = await listarImpresoras();
        if (vigente) setInstaladas(lista);
      } catch {
        // Fuera de la app instalada (navegador de desarrollo) no hay comando
        // nativo: no es un error que valga la pena mostrar como falla.
        if (vigente) setNoDisponible(true);
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, []);

  function elegir(nombre: string) {
    setElegida(nombre);
    configurarImpresora(nombre);
    setResultado(null);
  }

  async function probar() {
    setProbando(true);
    setResultado(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("imprimir_escpos", {
        impresora: elegida === IMPRESORA_PREDETERMINADA ? null : elegida,
        datos: bytesPruebaImpresion(),
      });
      setResultado({
        ok: true,
        texto: "Se mandó la prueba. Fijate que haya salido en papel.",
      });
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setProbando(false);
    }
  }

  const aviso = avisoDeImpresora(elegida, instaladas);

  return (
    <section className="card card__pad">
      <div className="section-title">Impresora de tickets</div>

      {noDisponible ? (
        <div className="config-ayuda">
          La lista de impresoras sólo está disponible en la aplicación instalada.
        </div>
      ) : (
        <>
          <div className="field">
            <label htmlFor="cfg-impresora">Impresora</label>
            <select
              id="cfg-impresora"
              className="input"
              value={elegida}
              disabled={cargando}
              onChange={(e) => elegir(e.target.value)}
            >
              <option value={IMPRESORA_PREDETERMINADA}>
                {cargando ? "Buscando impresoras…" : "Predeterminada de Windows"}
              </option>
              {instaladas.map((i) => (
                <option key={i.nombre} value={i.nombre}>
                  {etiquetaImpresora(i)}
                </option>
              ))}
            </select>
          </div>

          {aviso !== null && <div className="error config-error">{aviso}</div>}

          <div className="config-ayuda">
            Tiene que ser la impresora térmica de la caja. Las impresoras virtuales (Microsoft
            Print to PDF, XPS, OneNote, fax) guardan el ticket en un archivo en vez de imprimirlo.
          </div>

          <button
            type="button"
            className="pill-btn"
            onClick={() => void probar()}
            disabled={probando || cargando}
          >
            {probando ? "Probando…" : "Probar impresora"}
          </button>

          {resultado !== null && (
            <div className={resultado.ok ? "config-ayuda" : "error config-error"}>
              {resultado.texto}
            </div>
          )}
        </>
      )}
    </section>
  );
}
