/**
 * Panel de clientes (ADR-0056). Una sola página, sin build ni dependencias:
 * con la cantidad de comercios que hay, una tabla alcanza y sobra.
 *
 * El token se pide una vez y queda en `localStorage` de ese navegador. No hay
 * usuario ni contraseña: no hay nada que adivinar.
 */
export const PANEL_HTML = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NexoSoft · Clientes</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #f1f5f9; color: #0f172a; }
  header { background: #0f172a; color: #fff; padding: 1rem 1.2rem; display: flex; align-items: center; gap: .8rem; }
  header h1 { font-size: 1.1rem; margin: 0; font-weight: 600; }
  main { padding: 1.2rem; max-width: 1100px; margin: 0 auto; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(15,23,42,.1); }
  th, td { padding: .7rem .8rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: .9rem; }
  th { background: #f8fafc; font-weight: 600; color: #475569; }
  .estado { padding: .2rem .55rem; border-radius: 999px; font-size: .78rem; font-weight: 600; white-space: nowrap; }
  .ACTIVA { background: #dcfce7; color: #166534; }
  .RECORDATORIO { background: #dbeafe; color: #1e40af; }
  .ADVERTENCIA { background: #fef3c7; color: #92400e; }
  .BLOQUEADA { background: #fee2e2; color: #b91c1c; }
  select, input, button { font: inherit; padding: .4rem .5rem; border-radius: 6px; border: 1px solid #cbd5e1; }
  button { background: #2563eb; color: #fff; border: none; cursor: pointer; font-weight: 600; }
  button.sec { background: #e2e8f0; color: #334155; }
  .muted { color: #64748b; font-size: .82rem; }
  .alta { background: #fff; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; display: flex; gap: .5rem; flex-wrap: wrap; align-items: end; box-shadow: 0 1px 3px rgba(15,23,42,.1); }
  .campo { display: flex; flex-direction: column; gap: .2rem; }
  .campo span { font-size: .78rem; color: #475569; }
  .error { background: #fee2e2; color: #b91c1c; padding: .7rem .9rem; border-radius: 8px; margin-bottom: 1rem; }
  .sinContacto { color: #b91c1c; font-weight: 600; }
</style>
</head>
<body>
<header>
  <h1>NexoSoft · Clientes</h1>
  <span class="muted" id="resumen" style="color:#94a3b8"></span>
</header>
<main>
  <div id="error" class="error" style="display:none"></div>

  <div class="alta">
    <label class="campo"><span>Id del comercio (el del subdominio)</span><input id="nuevoId" placeholder="lagus"></label>
    <label class="campo"><span>Nombre</span><input id="nuevoNombre" placeholder="Lagus Minimarket"></label>
    <label class="campo"><span>Próximo pago</span><input id="nuevoVence" type="date"></label>
    <button id="alta">Dar de alta</button>
  </div>

  <table>
    <thead><tr>
      <th>Comercio</th><th>Estado</th><th>Próximo pago</th><th>Último contacto</th><th>Versión</th><th>Cambiar a</th>
    </tr></thead>
    <tbody id="filas"><tr><td colspan="6" class="muted">Cargando…</td></tr></tbody>
  </table>
  <p class="muted">Desbloquear es inmediato. Bloquear tiene un tope diario, como protección.
  El comercio ve el cambio la próxima vez que su servidor renueve la licencia (de madrugada, o al reiniciarse).</p>
</main>
<script>
const ESTADOS = ["ACTIVA","RECORDATORIO","ADVERTENCIA","BLOQUEADA"];
let token = localStorage.getItem("nexosoft.adminToken") || "";

function pedirToken() {
  const t = prompt("Token del panel:");
  if (t) { token = t.trim(); localStorage.setItem("nexosoft.adminToken", token); cargar(); }
}
function mostrarError(m) {
  const e = document.getElementById("error");
  e.textContent = m; e.style.display = m ? "block" : "none";
}
async function api(ruta, opciones) {
  const r = await fetch(ruta, { ...opciones, headers: { ...(opciones||{}).headers, "Content-Type":"application/json", Authorization: "Bearer " + token } });
  if (r.status === 401) { localStorage.removeItem("nexosoft.adminToken"); pedirToken(); throw new Error("Token inválido"); }
  const datos = await r.json();
  if (!r.ok) throw new Error(datos.error || "Error");
  return datos;
}
function diasDesde(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso)) / 86400000);
}
function contacto(c) {
  const d = diasDesde(c.ultimoContacto);
  if (d === null) return '<span class="sinContacto">nunca</span>';
  if (d === 0) return "hoy";
  if (d > 3) return '<span class="sinContacto">hace ' + d + ' días</span>';
  return "hace " + d + " días";
}
async function cambiar(id, estado) {
  const nombre = estado === "BLOQUEADA" ? "BLOQUEAR" : "cambiar a " + estado;
  if (!confirm("¿Seguro que querés " + nombre + " a " + id + "?")) return cargar();
  try { mostrarError(""); await api("/api/clientes/" + encodeURIComponent(id) + "/estado", { method: "POST", body: JSON.stringify({ estado }) }); }
  catch (e) { mostrarError(e.message); }
  cargar();
}
async function cargar() {
  if (!token) return pedirToken();
  try {
    mostrarError("");
    const clientes = await api("/api/clientes");
    const bloqueados = clientes.filter(c => c.estado === "BLOQUEADA").length;
    document.getElementById("resumen").textContent = clientes.length + " comercios · " + bloqueados + " bloqueados";
    document.getElementById("filas").innerHTML = clientes.length === 0
      ? '<tr><td colspan="6" class="muted">Todavía no hay comercios dados de alta.</td></tr>'
      : clientes.map(c =>
        '<tr><td><b>' + c.nombre + '</b><div class="muted">' + c.comercioId + '</div></td>' +
        '<td><span class="estado ' + c.estado + '">' + c.estado + '</span></td>' +
        '<td>' + (c.vencePagoEl || "—") + '</td>' +
        '<td>' + contacto(c) + '</td>' +
        '<td class="muted">' + (c.ultimaVersion || "—") + '</td>' +
        '<td><select data-id="' + c.comercioId + '">' +
          ESTADOS.map(e => '<option' + (e === c.estado ? " selected" : "") + '>' + e + '</option>').join("") +
        '</select></td></tr>').join("");
    document.querySelectorAll("select[data-id]").forEach(s => {
      s.onchange = () => cambiar(s.dataset.id, s.value);
    });
  } catch (e) { mostrarError(e.message); }
}
document.getElementById("alta").onclick = async () => {
  const comercioId = document.getElementById("nuevoId").value.trim();
  const nombre = document.getElementById("nuevoNombre").value.trim();
  const vencePagoEl = document.getElementById("nuevoVence").value;
  if (!comercioId) return mostrarError("Falta el id del comercio.");
  try {
    mostrarError("");
    await api("/api/clientes", { method: "POST", body: JSON.stringify({ comercioId, nombre, vencePagoEl }) });
    document.getElementById("nuevoId").value = "";
    document.getElementById("nuevoNombre").value = "";
    cargar();
  } catch (e) { mostrarError(e.message); }
};
cargar();
</script>
</body>
</html>`;
