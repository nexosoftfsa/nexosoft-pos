/**
 * Panel de clientes (ADR-0056, ADR-0067). Una sola página, sin build ni
 * dependencias: con la cantidad de comercios que hay, una tabla alcanza y
 * sobra.
 *
 * El token se pide una vez y queda en `localStorage` de ese navegador. No hay
 * usuario ni contraseña: no hay nada que adivinar.
 *
 * El estado que se ve es el **efectivo**: si el comercio va en automático sale
 * de su fecha de pago, y si alguien lo fijó a mano se muestra como excepción.
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
  main { padding: 1.2rem; max-width: 1250px; margin: 0 auto; }
  .tabla { overflow-x: auto; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(15,23,42,.1); }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: .6rem .7rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: .88rem; white-space: nowrap; }
  th { background: #f8fafc; font-weight: 600; color: #475569; }
  .estado { padding: .2rem .55rem; border-radius: 999px; font-size: .78rem; font-weight: 600; }
  .ACTIVA { background: #dcfce7; color: #166534; }
  .RECORDATORIO { background: #dbeafe; color: #1e40af; }
  .ADVERTENCIA { background: #fef3c7; color: #92400e; }
  .BLOQUEADA { background: #fee2e2; color: #b91c1c; }
  .plan { padding: .2rem .5rem; border-radius: 6px; font-size: .78rem; font-weight: 600; background: #ede9fe; color: #5b21b6; }
  select, input, button { font: inherit; font-size: .85rem; padding: .35rem .45rem; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; color: inherit; }
  button { background: #2563eb; color: #fff; border: none; cursor: pointer; font-weight: 600; }
  button.sec { background: #e2e8f0; color: #334155; }
  .muted { color: #64748b; font-size: .8rem; }
  .alta { background: #fff; padding: 1rem; border-radius: 10px; margin-bottom: 1rem; display: flex; gap: .5rem; flex-wrap: wrap; align-items: end; box-shadow: 0 1px 3px rgba(15,23,42,.1); }
  .campo { display: flex; flex-direction: column; gap: .2rem; }
  .campo span { font-size: .78rem; color: #475569; }
  .error { background: #fee2e2; color: #b91c1c; padding: .7rem .9rem; border-radius: 8px; margin-bottom: 1rem; }
  .sinContacto { color: #b91c1c; font-weight: 600; }
  .importe { width: 5.5rem; }
  .nota { margin-top: .9rem; line-height: 1.5; }
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
    <label class="campo"><span>Plan</span><select id="nuevoPlan"></select></label>
    <label class="campo"><span>Moneda</span><select id="nuevaMoneda"><option>USD</option><option>ARS</option></select></label>
    <label class="campo"><span>Precio mensual</span><input id="nuevoPrecio" class="importe" placeholder="50"></label>
    <label class="campo"><span>Próximo pago</span><input id="nuevoVence" type="date"></label>
    <button id="alta">Dar de alta</button>
  </div>

  <div class="tabla">
    <table>
      <thead><tr>
        <th>Comercio</th><th>Plan</th><th>Estado</th><th>Próximo pago</th><th>Precio</th>
        <th>Último contacto</th><th>Versión</th><th>Fijar estado</th><th></th>
      </tr></thead>
      <tbody id="filas"><tr><td colspan="9" class="muted">Cargando…</td></tr></tbody>
    </table>
  </div>

  <p class="muted nota">
    <b>El estado se calcula solo</b> a partir del próximo pago: avisa 7 días antes y pasa a
    advertencia cuando vence. <b>Bloquear nunca es automático</b> — sale de fijarlo a mano acá.
    "Pagó" corre la fecha un mes y devuelve el comercio a automático, aunque estuviera bloqueado.<br>
    Desbloquear es inmediato; bloquear tiene tope diario. El comercio ve el cambio dentro de los
    ~6 minutos (su servidor consulta cada 5, el POS cada 1).
  </p>
</main>
<script>
const ESTADOS = ["ACTIVA","RECORDATORIO","ADVERTENCIA","BLOQUEADA"];
const PLANES = ["BASICA","PLUS","PREMIUM"];
const NOMBRE_PLAN = { BASICA: "Básica", PLUS: "Plus", PREMIUM: "Premium" };
let token = localStorage.getItem("nexosoft.adminToken") || "";

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
    ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
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
function opciones(lista, elegida, etiquetas) {
  return lista.map(v => '<option value="' + v + '"' + (v === elegida ? " selected" : "") + '>' +
    esc(etiquetas ? etiquetas[v] : v) + '</option>').join("");
}

async function guardar(comercioId, campos) {
  try {
    mostrarError("");
    await api("/api/clientes", { method: "POST", body: JSON.stringify({ comercioId, ...campos }) });
  } catch (e) { mostrarError(e.message); }
  cargar();
}
async function fijarEstado(id, valor) {
  const estado = valor === "" ? null : valor;
  const que = estado === null ? "devolver a automático" : (estado === "BLOQUEADA" ? "BLOQUEAR" : "fijar en " + estado);
  if (!confirm("¿Seguro que querés " + que + " a " + id + "?")) return cargar();
  try {
    mostrarError("");
    await api("/api/clientes/" + encodeURIComponent(id) + "/estado", { method: "POST", body: JSON.stringify({ estado }) });
  } catch (e) { mostrarError(e.message); }
  cargar();
}
async function registrarPago(id, hasta) {
  if (!confirm("¿Registrar el pago de " + id + "?\\n\\nCorre el próximo vencimiento un mes y lo devuelve a automático (si estaba bloqueado, se desbloquea).")) return;
  try {
    mostrarError("");
    const r = await api("/api/clientes/" + encodeURIComponent(id) + "/pago", { method: "POST" });
    mostrarError("");
    alert("Listo. Próximo pago de " + id + ": " + r.vencePagoEl);
  } catch (e) { mostrarError(e.message); }
  cargar();
}

function fila(c) {
  const precio = c.precioMensual || { moneda: "USD", importe: "" };
  return '<tr>' +
    '<td><b>' + esc(c.nombre) + '</b><div class="muted">' + esc(c.comercioId) + '</div></td>' +
    '<td><select data-plan="' + esc(c.comercioId) + '">' + opciones(PLANES, c.plan, NOMBRE_PLAN) + '</select></td>' +
    '<td><span class="estado ' + esc(c.estado) + '">' + esc(c.estado) + '</span>' +
      '<div class="muted">' + (c.automatico ? "automático" : "fijado a mano") + '</div></td>' +
    '<td><input type="date" data-vence="' + esc(c.comercioId) + '" value="' + esc(c.vencePagoEl) + '"></td>' +
    '<td><select data-moneda="' + esc(c.comercioId) + '">' + opciones(["USD","ARS"], precio.moneda) + '</select> ' +
      '<input class="importe" data-importe="' + esc(c.comercioId) + '" value="' + esc(precio.importe) + '" placeholder="—"></td>' +
    '<td>' + contacto(c) + '</td>' +
    '<td class="muted">' + esc(c.ultimaVersion || "—") + '</td>' +
    '<td><select data-estado="' + esc(c.comercioId) + '">' +
      '<option value=""' + (c.automatico ? " selected" : "") + '>— automático —</option>' +
      opciones(ESTADOS, c.automatico ? null : c.estado) + '</select></td>' +
    '<td><button class="sec" data-pago="' + esc(c.comercioId) + '">Pagó</button></td>' +
  '</tr>';
}

function conectar() {
  document.querySelectorAll("[data-plan]").forEach(s => {
    s.onchange = () => guardar(s.dataset.plan, { plan: s.value });
  });
  document.querySelectorAll("[data-vence]").forEach(i => {
    i.onchange = () => guardar(i.dataset.vence, { vencePagoEl: i.value });
  });
  document.querySelectorAll("[data-estado]").forEach(s => {
    s.onchange = () => fijarEstado(s.dataset.estado, s.value);
  });
  document.querySelectorAll("[data-pago]").forEach(b => {
    b.onclick = () => registrarPago(b.dataset.pago);
  });
  const precio = (id) => {
    const moneda = document.querySelector('[data-moneda="' + CSS.escape(id) + '"]').value;
    const importe = document.querySelector('[data-importe="' + CSS.escape(id) + '"]').value.trim();
    guardar(id, { precioMensual: importe === "" ? null : { moneda, importe } });
  };
  document.querySelectorAll("[data-moneda]").forEach(s => { s.onchange = () => precio(s.dataset.moneda); });
  document.querySelectorAll("[data-importe]").forEach(i => { i.onchange = () => precio(i.dataset.importe); });
}

async function cargar() {
  if (!token) return pedirToken();
  try {
    mostrarError("");
    const clientes = await api("/api/clientes");
    const bloqueados = clientes.filter(c => c.estado === "BLOQUEADA").length;
    const porPlan = PLANES.map(p => clientes.filter(c => c.plan === p).length + " " + NOMBRE_PLAN[p]).join(" · ");
    document.getElementById("resumen").textContent =
      clientes.length + " comercios · " + porPlan + " · " + bloqueados + " bloqueados";
    document.getElementById("filas").innerHTML = clientes.length === 0
      ? '<tr><td colspan="9" class="muted">Todavía no hay comercios dados de alta.</td></tr>'
      : clientes.map(fila).join("");
    conectar();
  } catch (e) { mostrarError(e.message); }
}

document.getElementById("nuevoPlan").innerHTML = opciones(PLANES, "BASICA", NOMBRE_PLAN);
document.getElementById("alta").onclick = async () => {
  const comercioId = document.getElementById("nuevoId").value.trim();
  const nombre = document.getElementById("nuevoNombre").value.trim();
  const vencePagoEl = document.getElementById("nuevoVence").value;
  const plan = document.getElementById("nuevoPlan").value;
  const importe = document.getElementById("nuevoPrecio").value.trim();
  const moneda = document.getElementById("nuevaMoneda").value;
  if (!comercioId) return mostrarError("Falta el id del comercio.");
  const cuerpo = { comercioId, nombre, vencePagoEl, plan };
  if (importe !== "") cuerpo.precioMensual = { moneda, importe };
  try {
    mostrarError("");
    await api("/api/clientes", { method: "POST", body: JSON.stringify(cuerpo) });
    document.getElementById("nuevoId").value = "";
    document.getElementById("nuevoNombre").value = "";
    document.getElementById("nuevoPrecio").value = "";
    cargar();
  } catch (e) { mostrarError(e.message); }
};
cargar();
</script>
</body>
</html>`;
