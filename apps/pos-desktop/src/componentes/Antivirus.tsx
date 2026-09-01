import { useState } from "react";

import { excluirDelAntivirus } from "../datos/excluir-antivirus";

/**
 * "Proteger del antivirus": excluye las carpetas de NexoSoft y recupera lo que
 * el antivirus ya se haya llevado.
 *
 * Existe porque el ejecutable del POS no está firmado con un certificado de
 * código, y un `.exe` sin firma en `AppData\Local` es exactamente lo que los
 * antivirus marcan por heurística. Le pasó a una terminal: Defender se llevó
 * `nexosoft-pos.exe` a cuarentena y el POS dejó de abrir.
 *
 * Es un botón y **no algo que corra solo al instalar**, a propósito: excluir
 * una carpeta del antivirus baja la protección de esa carpeta, y esa decisión
 * la tiene que tomar alguien, no el instalador por su cuenta. Por eso también
 * se dice acá, en la tarjeta, qué es lo que hace.
 */
export function Antivirus() {
  const [trabajando, setTrabajando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; detalle: string } | null>(null);

  async function ejecutar() {
    setTrabajando(true);
    setResultado(null);
    try {
      setResultado(await excluirDelAntivirus());
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <section className="card card__pad">
      <div className="section-title">Antivirus</div>

      <div className="config-ayuda">
        Algunos antivirus confunden al POS con un programa peligroso y lo borran, y entonces la
        terminal deja de abrir. Esto le avisa a Windows Defender que las carpetas de NexoSoft son
        de confianza, y recupera lo que ya se haya llevado.
        <br />
        <br />
        Va a pedir permiso de administrador. Sólo se excluyen las dos carpetas de NexoSoft: el
        resto de la PC sigue protegido igual.
      </div>

      <button
        type="button"
        className="pill-btn"
        onClick={() => void ejecutar()}
        disabled={trabajando}
      >
        {trabajando ? "Configurando…" : "Proteger del antivirus"}
      </button>

      {resultado !== null && (
        <div className={resultado.ok ? "aviso-ok" : "error config-error"}>{resultado.detalle}</div>
      )}
    </section>
  );
}
