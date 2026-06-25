/* ============================================================================
   NexoSoft — Maqueta INTERACTIVA para demostración (cliente-side, sin backend).
   Datos en memoria + localStorage. No reemplaza la app real (React + Tauri).
   ========================================================================== */

/* ---------------- Helpers ---------------- */
var nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
var nf3 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });
function money(n) { return "$ " + nf0.format(Math.round(+n || 0)); }
function qtyFmt(n) { return nf3.format(+n || 0); }
function byId(id) { return document.getElementById(id); }
function val(id) { var e = byId(id); return e ? e.value : ""; }
function numv(id) { return parseFloat(val(id)) || 0; }
function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function pad(n, len) { return String(n).padStart(len || 4, "0"); }
function hhmm() { var d = new Date(); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
function hoy() { var d = new Date(); return pad(d.getDate(), 2) + "/" + pad(d.getMonth() + 1, 2) + "/" + d.getFullYear(); }
function caeSim() { return String(Math.floor(7e13 + Math.random() * 2.9e13)); }

/* ---------------- Datos (seed) ---------------- */
var STORE_KEY = "nexosoft_demo_v2";
var DB;
function seed() {
  return {
    config: { condicionIva: "RI", razonSocial: "Supermercado 3 Marías", cuit: "30-71122334-5", puntoVenta: "0001", sync: true, syncAuto: true, backup: true },
    ui: { lista: "minorista", stockSoloAlertas: false, ctaTab: "clientes" },
    contador: 128,
    products: [
      { id: "p1", codigo: "7790895", nombre: "Coca-Cola 2.25L", emoji: "🥤", rubro: "Bebidas", costo: 1620, precioMin: 2450, precioMay: 2150, stock: 48, minimo: 12, unidad: "unidad", iva: 21 },
      { id: "p2", codigo: "7791234", nombre: "Yerba Playadito 1kg", emoji: "🧉", rubro: "Almacén", costo: 2730, precioMin: 3900, precioMay: 3500, stock: 22, minimo: 10, unidad: "unidad", iva: 21 },
      { id: "p3", codigo: "7790045", nombre: "Leche La Serenísima 1L", emoji: "🥛", rubro: "Lácteos", costo: 980, precioMin: 1380, precioMay: 1200, stock: 9, minimo: 15, unidad: "unidad", iva: 21 },
      { id: "p4", codigo: "7790078", nombre: "Pan lactal Bimbo", emoji: "🍞", rubro: "Panadería", costo: 1400, precioMin: 2100, precioMay: 1850, stock: 5, minimo: 8, unidad: "unidad", iva: 21 },
      { id: "p5", codigo: "", nombre: "Queso cremoso", emoji: "🧀", rubro: "Fiambrería", costo: 6100, precioMin: 8900, precioMay: 8000, stock: 7.4, minimo: 5, unidad: "kg", iva: 21 },
      { id: "p6", codigo: "7790512", nombre: "Café La Virginia 250g", emoji: "☕", rubro: "Almacén", costo: 2900, precioMin: 4250, precioMay: 3800, stock: 31, minimo: 10, unidad: "unidad", iva: 21 },
      { id: "p7", codigo: "7790311", nombre: "Fideos Matarazzo 500g", emoji: "🍝", rubro: "Almacén", costo: 760, precioMin: 1150, precioMay: 1000, stock: 0, minimo: 12, unidad: "unidad", iva: 21 },
      { id: "p8", codigo: "7790990", nombre: "Jabón en polvo Skip 800g", emoji: "🧼", rubro: "Limpieza", costo: 3850, precioMin: 5600, precioMay: 5000, stock: 14, minimo: 6, unidad: "unidad", iva: 21 },
      { id: "p9", codigo: "", nombre: "Carne picada", emoji: "🥩", rubro: "Fiambrería", costo: 4500, precioMin: 6500, precioMay: 5900, stock: 12.5, minimo: 8, unidad: "kg", iva: 21 },
      { id: "p10", codigo: "7790777", nombre: "Cerveza Quilmes 1L", emoji: "🍺", rubro: "Bebidas", costo: 1500, precioMin: 2300, precioMay: 2050, stock: 36, minimo: 10, unidad: "unidad", iva: 21 }
    ],
    clients: [
      { id: "c1", nombre: "Kiosco El Faro", cuit: "30-71122334-5", condicion: "Resp. Inscripto", saldo: 142300, limite: 200000 },
      { id: "c2", nombre: "Almacén Doña Rosa", cuit: "27-28455667-1", condicion: "Monotributo", saldo: 89500, limite: 80000 },
      { id: "c3", nombre: "Bar La Esquina", cuit: "20-30566778-9", condicion: "Resp. Inscripto", saldo: 0, limite: 150000 },
      { id: "c4", nombre: "Rotisería Central", cuit: "23-31677889-4", condicion: "Consumidor Final", saldo: 34800, limite: 50000 }
    ],
    caja: {
      abierta: true,
      movimientos: [
        { hora: "08:30", concepto: "Apertura de caja", tipo: "apertura", monto: 50000 },
        { hora: "11:40", concepto: "Pago proveedor — Distribuidora Sur", tipo: "egreso", monto: 11420 },
        { hora: "13:22", concepto: "Ingreso manual — Vuelto inicial", tipo: "ingreso", monto: 5000 }
      ]
    },
    ventas: [
      { n: 121, hora: "09:14", items: [{ pid: "p1", q: 3 }, { pid: "p3", q: 2 }], pago: "efectivo", receptor: "CF" },
      { n: 122, hora: "09:48", items: [{ pid: "p2", q: 1 }, { pid: "p6", q: 2 }, { pid: "p4", q: 1 }], pago: "tarjeta", receptor: "RI", clienteId: "c1" },
      { n: 123, hora: "10:30", items: [{ pid: "p1", q: 2 }, { pid: "p10", q: 4 }], pago: "mp", receptor: "CF" },
      { n: 124, hora: "11:05", items: [{ pid: "p5", q: 1 }, { pid: "p9", q: 1.2 }], pago: "efectivo", receptor: "CF" },
      { n: 125, hora: "11:52", items: [{ pid: "p8", q: 1 }, { pid: "p3", q: 3 }], pago: "efectivo", receptor: "CF" },
      { n: 126, hora: "12:20", items: [{ pid: "p6", q: 1 }, { pid: "p2", q: 2 }], pago: "ctacte", receptor: "RI", clienteId: "c3" },
      { n: 127, hora: "12:58", items: [{ pid: "p1", q: 1 }, { pid: "p4", q: 2 }, { pid: "p3", q: 1 }], pago: "tarjeta", receptor: "CF" },
      { n: 128, hora: "13:40", items: [{ pid: "p10", q: 6 }], pago: "efectivo", receptor: "CF" }
    ]
  };
}
function load() { try { var r = localStorage.getItem(STORE_KEY); if (r) { DB = JSON.parse(r); return; } } catch (e) {} DB = seed(); }
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {} }

/* ---------------- Estado transitorio del POS ---------------- */
var cart = [];
var posCat = "Todos";
var currentPago = "efectivo";
var currentCliente = null; // null = Consumidor Final
var descuentoPct = 0;

/* ---------------- Dominio ---------------- */
function prod(id) { for (var i = 0; i < DB.products.length; i++) if (DB.products[i].id === id) return DB.products[i]; return null; }
function cliente(id) { for (var i = 0; i < DB.clients.length; i++) if (DB.clients[i].id === id) return DB.clients[i]; return null; }
function price(p) { return DB.ui.lista === "mayorista" ? p.precioMay : p.precioMin; }
function rubros() { var r = []; DB.products.forEach(function (p) { if (r.indexOf(p.rubro) < 0) r.push(p.rubro); }); return r; }
function ventasActivas() { return DB.ventas.filter(function (v) { return !v.anulada; }); }
function ventaBruto(v) { return v.items.reduce(function (s, it) { var p = prod(it.pid); var pr = it.precio != null ? it.precio : (p ? p.precioMin : 0); return s + pr * it.q; }, 0); }
function ventaTotal(v) { return ventaBruto(v) - (v.descuento || 0); }
function condToReceptor(cond) { return { "Resp. Inscripto": "RI", "Monotributo": "Mono", "Consumidor Final": "CF", "Exento": "Exento" }[cond] || "CF"; }
function receptorDe(cli) { return cli ? condToReceptor(cli.condicion) : "CF"; }
function tipoComprobante(emisor, receptor) { if (emisor === "Mono") return "Factura C"; if (receptor === "RI") return "Factura A"; return "Factura B"; }
function pagoLabel(m) { return { efectivo: "Efectivo", tarjeta: "Tarjeta", mp: "MercadoPago QR", ctacte: "Cuenta Corriente" }[m] || m; }
function estadoStock(p) {
  if (p.stock <= 0) return '<span class="badge badge--danger">Sin stock</span>';
  if (p.stock < p.minimo) return '<span class="badge badge--warn">Stock bajo</span>';
  return '<span class="badge badge--ok">OK</span>';
}
function emojiFor(r) { return { Bebidas: "🥤", Almacén: "🛒", Lácteos: "🥛", Fiambrería: "🧀", Limpieza: "🧼", Panadería: "🍞" }[r] || "📦"; }
function nombreCliente(v) { var c = v.clienteId ? cliente(v.clienteId) : null; return c ? c.nombre : "Consumidor Final"; }

/* ---------------- Navegación ---------------- */
var RENDERERS = { inicio: renderInicio, pos: renderPOS, catalogo: renderCatalogo, stock: renderStock, caja: renderCaja, ctacte: renderCuentas, reportes: renderReportes, config: renderConfig, ia: function () {} };
function go(id) { var n = document.querySelector('.nav-item[data-target="' + id + '"]'); if (n) n.click(); }
function setSeg(id, idx) { var bs = byId(id).querySelectorAll("button"); for (var i = 0; i < bs.length; i++) bs[i].classList.toggle("on", i === idx); }

/* ---------------- INICIO ---------------- */
function renderInicio() {
  var v = ventasActivas(), totalDia = 0, ing = 0, cost = 0, agg = {};
  v.forEach(function (vt) {
    totalDia += ventaTotal(vt);
    vt.items.forEach(function (it) { var p = prod(it.pid); if (!p) return; var pr = it.precio != null ? it.precio : p.precioMin; ing += pr * it.q; cost += p.costo * it.q; agg[it.pid] = (agg[it.pid] || 0) + it.q; });
  });
  byId("kpiVentas").textContent = money(totalDia);
  byId("kpiComp").textContent = v.length;
  byId("kpiTicket").textContent = v.length ? money(totalDia / v.length) : "$ 0";
  byId("kpiMargen").textContent = ing ? ((ing - cost) / ing * 100).toFixed(1).replace(".", ",") + "%" : "—";
  var top = Object.keys(agg).map(function (k) { return { p: prod(k), q: agg[k] }; }).filter(function (x) { return x.p; }).sort(function (a, b) { return b.q - a.q; }).slice(0, 5);
  byId("masVendidos").innerHTML = top.map(function (x) { return "<tr><td>" + (x.p.emoji || "📦") + " " + esc(x.p.nombre) + '</td><td class="num strong">' + qtyFmt(x.q) + "</td></tr>"; }).join("") || '<tr><td class="muted">Sin ventas aún</td><td></td></tr>';
}

/* ---------------- POS ---------------- */
function renderPOS() {
  byId("posCats").innerHTML = ["Todos"].concat(rubros()).map(function (r) { return '<button class="cat' + (r === posCat ? " cat--on" : "") + '" data-cat="' + esc(r) + '">' + esc(r) + "</button>"; }).join("");
  var q = (val("posSearch") || "").toLowerCase();
  var list = DB.products.filter(function (p) { return (posCat === "Todos" || p.rubro === posCat) && (p.nombre.toLowerCase().indexOf(q) >= 0 || (p.codigo || "").indexOf(q) >= 0); });
  byId("posProducts").innerHTML = list.length ? list.map(function (p) {
    var off = p.stock <= 0;
    return '<button class="prod' + (off ? " prod--off" : "") + '" data-add="' + p.id + '">' +
      '<div class="prod__emoji">' + (p.emoji || "📦") + "</div>" +
      '<div class="prod__name">' + esc(p.nombre) + "</div>" +
      '<div class="prod__meta">' + (off ? "Sin stock" : (p.unidad === "kg" ? "x kg · balanza" : "Cód. " + (p.codigo || "—"))) + "</div>" +
      '<div class="prod__price">' + money(price(p)) + (p.unidad === "kg" ? "/kg" : "") + "</div></button>";
  }).join("") : '<div class="empty">Sin resultados para la búsqueda</div>';
  renderTicket();
}
function renderTicket() {
  // Cliente
  byId("ticketCli").innerHTML = '<button class="cli-pick" id="cliPick">👤 <span>' + esc(currentCliente ? currentCliente.nombre : "Consumidor Final") + '</span> <span class="muted">cambiar</span></button>';
  // Items
  var items = cart.map(function (c) { var p = prod(c.pid); return { p: p, q: c.qty, precio: price(p) }; }).filter(function (x) { return x.p; });
  byId("posItems").innerHTML = items.length ? items.map(function (it) {
    return '<div class="ti"><div class="ti__steps">' +
      '<button class="stepbtn" data-step="-1" data-id="' + it.p.id + '">–</button>' +
      '<span class="ti__q">' + qtyFmt(it.q) + "</span>" +
      '<button class="stepbtn" data-step="1" data-id="' + it.p.id + '">+</button></div>' +
      '<div class="ti__main"><div class="ti__name">' + esc(it.p.nombre) + "</div>" +
      '<div class="ti__unit">' + money(it.precio) + (it.p.unidad === "kg" ? " /kg" : " c/u") + "</div></div>" +
      '<div class="ti__price">' + money(it.precio * it.q) + "</div>" +
      '<button class="ti__x" data-del="' + it.p.id + '">×</button></div>';
  }).join("") : '<div class="empty">🛒 Ticket vacío<br><span class="muted">Tocá un producto para agregarlo</span></div>';
  // Totales
  var bruto = items.reduce(function (s, it) { return s + it.precio * it.q; }, 0);
  var desc = Math.round(bruto * descuentoPct / 100);
  var total = bruto - desc;
  var disc = DB.config.condicionIva === "RI";
  var neto = disc ? total / 1.21 : total, iva = total - neto;
  byId("posTipo").textContent = tipoComprobante(DB.config.condicionIva, receptorDe(currentCliente));
  byId("posSubBruto").textContent = money(bruto);
  byId("posDescRow").style.display = descuentoPct > 0 ? "flex" : "none";
  byId("posDesc").textContent = "– " + money(desc) + " (" + descuentoPct + "%)";
  byId("posIva").textContent = disc ? money(iva) : "No discrimina";
  byId("posTotal").textContent = money(total);
  byId("posCobrar").innerHTML = "COBRAR · " + money(total) + ' <span class="kbd" style="color:#0E2C49">F12</span>';
  byId("posPays").querySelectorAll(".pay").forEach(function (b) { b.classList.toggle("pay--on", b.dataset.pago === currentPago); });
  byId("posEfectivo").style.display = currentPago === "efectivo" ? "flex" : "none";
  if (currentPago === "efectivo") posVuelto();
}
function posTotalActual() { var b = cart.reduce(function (s, c) { return s + price(prod(c.pid)) * c.qty; }, 0); return b - Math.round(b * descuentoPct / 100); }
function posAdd(id) {
  var p = prod(id); if (!p) return;
  if (p.stock <= 0) { toast("« " + p.nombre + " » sin stock", "warn"); return; }
  var c = cart.filter(function (x) { return x.pid === id; })[0];
  if (c) c.qty += 1; else cart.push({ pid: id, qty: 1 });
  renderTicket();
}
function posStep(id, d) { var c = cart.filter(function (x) { return x.pid === id; })[0]; if (!c) return; c.qty += d; if (c.qty <= 0) cart = cart.filter(function (x) { return x.pid !== id; }); renderTicket(); }
function posRemove(id) { cart = cart.filter(function (x) { return x.pid !== id; }); renderTicket(); }
function posSetCat(c) { posCat = c; renderPOS(); }
function selectPago(m) { if (m === "ctacte" && !currentCliente) { toast("Cuenta Corriente: elegí primero un cliente", "warn"); elegirCliente(); return; } currentPago = m; renderTicket(); }
function posVuelto() { var total = posTotalActual(); var paga = parseFloat(val("posPaga")) || 0; byId("posVuelto").textContent = paga > total ? "Vuelto " + money(paga - total) : ""; }
function posEnter() {
  var q = (val("posSearch") || "").toLowerCase().trim(); if (!q) return;
  var m = DB.products.filter(function (p) { return (p.codigo || "").toLowerCase() === q || p.nombre.toLowerCase().indexOf(q) >= 0; });
  if (m.length) { posAdd(m[0].id); byId("posSearch").value = ""; renderPOS(); }
}
function vaciarTicket() { if (!cart.length) return; cart = []; descuentoPct = 0; renderTicket(); toast("Ticket vaciado"); }
function elegirCliente() {
  var opts = [["", "Consumidor Final"]].concat(DB.clients.map(function (c) { return [c.id, c.nombre + " · " + c.condicion]; }));
  openModal("Cliente del comprobante", selectHtml("cl_sel", "Cliente", opts, currentCliente ? currentCliente.id : ""), function () {
    var id = val("cl_sel"); currentCliente = id ? cliente(id) : null; renderTicket();
    toast("Cliente: " + (currentCliente ? currentCliente.nombre : "Consumidor Final"), "ok");
  }, "Aceptar");
}
function setDescuento() {
  openModal("Descuento del ticket", fieldHtml("d_pct", "Descuento %", descuentoPct, "number"), function () {
    descuentoPct = Math.max(0, Math.min(100, numv("d_pct"))); renderTicket(); toast(descuentoPct ? "Descuento " + descuentoPct + "%" : "Descuento quitado", "ok");
  }, "Aplicar");
}
function cobrar() {
  if (!cart.length) { toast("El ticket está vacío", "warn"); return; }
  if (currentPago === "ctacte" && !currentCliente) { toast("Cuenta Corriente necesita un cliente", "warn"); return; }
  var items = cart.map(function (c) { var p = prod(c.pid); return { pid: p.id, q: c.qty, precio: price(p) }; });
  var bruto = items.reduce(function (s, it) { return s + it.precio * it.q; }, 0);
  var desc = Math.round(bruto * descuentoPct / 100), total = bruto - desc;
  var disc = DB.config.condicionIva === "RI", neto = disc ? Math.round(total / 1.21) : total, iva = total - neto;
  var receptor = receptorDe(currentCliente), tipo = tipoComprobante(DB.config.condicionIva, receptor);
  DB.contador += 1; var nro = DB.contador;
  DB.ventas.push({ n: nro, hora: hhmm(), items: items, pago: currentPago, receptor: receptor, clienteId: currentCliente ? currentCliente.id : null, descuento: desc, anulada: false });
  items.forEach(function (it) { var p = prod(it.pid); if (p) p.stock = Math.max(0, +(p.stock - it.q).toFixed(3)); });
  if (currentPago === "efectivo") DB.caja.movimientos.push({ hora: hhmm(), concepto: "Venta #" + pad(nro, 5) + " — Efectivo", tipo: "venta", monto: total });
  if (currentPago === "ctacte" && currentCliente) currentCliente.saldo += total;
  var paga = parseFloat(val("posPaga")) || 0, vuelto = currentPago === "efectivo" && paga > total ? paga - total : 0;
  var cae = caeSim();
  var cliName = currentCliente ? currentCliente.nombre : "Consumidor Final";
  var receipt = buildReceipt(tipo, nro, items, bruto, desc, neto, iva, total, paga, vuelto, cae, cliName);
  save(); cart = []; currentPago = "efectivo"; var cli = currentCliente; currentCliente = null; descuentoPct = 0;
  renderPOS(); renderInicio(); renderReportes(); renderCaja(); if (cli) renderCuentas();
  openModal("Venta registrada", receipt, function () {}, "Nueva venta", "Imprimir", function () { toast("Ticket enviado a la impresora (demo)", "ok"); return false; });
}
function buildReceipt(tipo, nro, items, bruto, desc, neto, iva, total, paga, vuelto, cae, cliName) {
  var L = items.map(function (it) {
    var p = prod(it.pid);
    return '<div class="r-row"><span>' + qtyFmt(it.q) + " x " + esc(p.nombre).slice(0, 18) + '</span><span>' + money(it.precio * it.q) + "</span></div>";
  }).join("");
  return '<div class="receipt">' +
    '<div class="r-c r-b">' + esc(DB.config.razonSocial) + "</div>" +
    '<div class="r-c">CUIT ' + esc(DB.config.cuit) + " · P.V. " + esc(DB.config.puntoVenta) + "</div>" +
    '<div class="r-c">' + hoy() + " " + hhmm() + "</div><hr>" +
    '<div class="r-b">' + tipo + " N° " + DB.config.puntoVenta + "-" + pad(nro, 8) + "</div>" +
    '<div>Cliente: ' + esc(cliName) + "</div><hr>" + L + "<hr>" +
    '<div class="r-row"><span>Subtotal</span><span>' + money(bruto) + "</span></div>" +
    (desc > 0 ? '<div class="r-row"><span>Descuento</span><span>– ' + money(desc) + "</span></div>" : "") +
    (DB.config.condicionIva === "RI" ? '<div class="r-row"><span>Neto / IVA 21%</span><span>' + money(neto) + " / " + money(iva) + "</span></div>" : "") +
    '<div class="r-row r-b" style="font-size:15px"><span>TOTAL</span><span>' + money(total) + "</span></div>" +
    '<div class="r-row"><span>' + pagoLabel(currentPago) + "</span><span>" + (paga ? money(paga) : money(total)) + "</span></div>" +
    (vuelto ? '<div class="r-row"><span>Vuelto</span><span>' + money(vuelto) + "</span></div>" : "") +
    "<hr><div class=\"r-c\">CAE " + cae + "</div>" +
    '<div class="r-c">Estado: AUTORIZADA ✓</div>' +
    '<div class="r-c" style="margin-top:6px">¡Gracias por su compra!</div></div>';
}

/* ---------------- CATÁLOGO ---------------- */
function renderCatalogo() {
  var lista = DB.ui.lista;
  setSeg("catSeg", lista === "mayorista" ? 1 : 0);
  byId("catPrecioLabel").textContent = lista === "mayorista" ? "P. Mayorista" : "P. Minorista";
  var q = (val("catSearch") || "").toLowerCase(), ru = val("catRubro") || "Todos";
  var rows = DB.products.filter(function (p) { return (ru === "Todos" || p.rubro === ru) && (p.nombre.toLowerCase().indexOf(q) >= 0 || (p.codigo || "").indexOf(q) >= 0); });
  byId("catalogoBody").innerHTML = rows.map(function (p) {
    var precio = lista === "mayorista" ? p.precioMay : p.precioMin, util = p.costo ? Math.round((precio - p.costo) / p.costo * 100) : 0;
    return '<tr class="clickable" data-edit="' + p.id + '"><td>' + esc(p.codigo || "—") + '</td><td class="strong">' + esc(p.nombre) + "</td><td>" + esc(p.rubro) + "</td>" +
      '<td class="num">' + money(p.costo) + '</td><td class="num">+' + util + '%</td><td class="num strong">' + money(precio) + "</td>" +
      '<td class="num">' + qtyFmt(p.stock) + "</td><td>" + estadoStock(p) + "</td></tr>";
  }).join("") || '<tr><td colspan="8" class="muted" style="text-align:center;padding:26px">Sin resultados</td></tr>';
}
function setLista(l) { DB.ui.lista = l; save(); renderCatalogo(); renderPOS(); }
function selOpts(arr, sel) { return arr.map(function (o) { var value = Array.isArray(o) ? o[0] : o, label = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(value) + '"' + (value === sel ? " selected" : "") + ">" + esc(label) + "</option>"; }).join(""); }
function fieldHtml(id, label, value, type) { return '<div class="field"><label>' + label + '</label><input id="' + id + '" class="input" type="' + (type || "text") + '" value="' + esc(value) + '"></div>'; }
function selectHtml(id, label, arr, sel) { return '<div class="field"><label>' + label + '</label><select id="' + id + '" class="input">' + selOpts(arr, sel) + "</select></div>"; }
function openProductModal(pid) {
  var p = pid ? prod(pid) : null, rs = ["Bebidas", "Almacén", "Lácteos", "Fiambrería", "Limpieza", "Panadería", "Otros"];
  var util = p ? Math.round((p.precioMin - p.costo) / p.costo * 100) : 40;
  var body = fieldHtml("m_nombre", "Descripción", p ? p.nombre : "") +
    '<div class="modal__row">' + fieldHtml("m_codigo", "Código de barras", p ? p.codigo : "") + selectHtml("m_rubro", "Rubro", rs, p ? p.rubro : "Almacén") + "</div>" +
    '<div class="modal__row">' + fieldHtml("m_costo", "Costo $", p ? p.costo : 0, "number") + fieldHtml("m_util", "Utilidad %", util, "number") + "</div>" +
    '<div class="modal__row">' + fieldHtml("m_stock", "Stock", p ? p.stock : 0, "number") + fieldHtml("m_min", "Stock mínimo", p ? p.minimo : 5, "number") + "</div>" +
    selectHtml("m_unidad", "Unidad", [["unidad", "Por unidad"], ["kg", "Por kilo (balanza)"]], p ? p.unidad : "unidad");
  openModal(pid ? "Editar artículo" : "Nuevo artículo", body, function () {
    var nombre = val("m_nombre").trim(); if (!nombre) { toast("Poné una descripción", "warn"); return false; }
    var costo = numv("m_costo"), u = numv("m_util"), precioMin = Math.round(costo * (1 + u / 100));
    var data = { codigo: val("m_codigo").trim(), nombre: nombre, rubro: val("m_rubro"), costo: costo, precioMin: precioMin, precioMay: Math.round(precioMin * 0.9), stock: numv("m_stock"), minimo: numv("m_min"), unidad: val("m_unidad"), iva: 21, emoji: p ? p.emoji : emojiFor(val("m_rubro")) };
    if (p) { for (var k in data) p[k] = data[k]; toast("Artículo actualizado", "ok"); } else { data.id = "p" + Date.now(); DB.products.push(data); toast("Artículo agregado al catálogo", "ok"); }
    save(); renderCatalogo(); renderPOS(); renderStock(); renderInicio();
  }, pid ? "Guardar cambios" : "Agregar");
}

/* ---------------- STOCK ---------------- */
function renderStock() {
  var ps = DB.products;
  byId("stockActivos").textContent = ps.length;
  byId("stockBajo").textContent = ps.filter(function (p) { return p.stock > 0 && p.stock < p.minimo; }).length;
  byId("stockSin").textContent = ps.filter(function (p) { return p.stock <= 0; }).length;
  var rows = DB.ui.stockSoloAlertas ? ps.filter(function (p) { return p.stock < p.minimo; }) : ps;
  byId("stockBody").innerHTML = rows.map(function (p) {
    return '<tr><td class="strong">' + esc(p.nombre) + "</td><td>" + (p.unidad === "kg" ? "Fiambrería" : "Salón") + '</td><td class="num">' + qtyFmt(p.stock) + '</td><td class="num">' + qtyFmt(p.minimo) + "</td><td>" + (p.unidad === "kg" ? "Fraccionado" : "—") + "</td><td>" + estadoStock(p) + "</td></tr>";
  }).join("") || '<tr><td colspan="6" class="muted" style="text-align:center;padding:26px">Sin artículos</td></tr>';
  byId("stockAlertBtn").textContent = DB.ui.stockSoloAlertas ? "Ver todos" : "Ver sólo alertas";
}
function toggleStockAlertas() { DB.ui.stockSoloAlertas = !DB.ui.stockSoloAlertas; save(); renderStock(); }
function ingresoStock() {
  openModal("Ingreso por compra", selectHtml("s_prod", "Artículo", DB.products.map(function (p) { return [p.id, p.nombre]; }), DB.products[0].id) + fieldHtml("s_cant", "Cantidad a ingresar", 1, "number"), function () {
    var p = prod(val("s_prod")), c = numv("s_cant"); if (c <= 0) { toast("Cantidad inválida", "warn"); return false; }
    p.stock = +(p.stock + c).toFixed(3); save(); renderStock(); renderCatalogo(); renderPOS(); renderInicio(); toast("Ingresaron " + qtyFmt(c) + " de " + p.nombre, "ok");
  }, "Ingresar");
}
function ajusteStock() {
  openModal("Ajuste manual de stock", selectHtml("s_prod", "Artículo", DB.products.map(function (p) { return [p.id, p.nombre]; }), DB.products[0].id) + fieldHtml("s_nuevo", "Stock real (ajuste)", DB.products[0].stock, "number"), function () {
    var p = prod(val("s_prod")); p.stock = Math.max(0, numv("s_nuevo")); save(); renderStock(); renderCatalogo(); renderPOS(); renderInicio(); toast("Stock ajustado", "ok");
  }, "Ajustar");
}

/* ---------------- CAJA ---------------- */
function sumTipo(t) { return DB.caja.movimientos.filter(function (m) { return m.tipo === t; }).reduce(function (s, m) { return s + m.monto; }, 0); }
function cajaSaldo() { return DB.caja.movimientos.reduce(function (s, m) { return s + (m.tipo === "egreso" ? -m.monto : m.monto); }, 0); }
function cajaBadge(t) { return { apertura: '<span class="badge badge--n">Apertura</span>', ingreso: '<span class="badge badge--ok">Ingreso</span>', venta: '<span class="badge badge--ok">Venta</span>', egreso: '<span class="badge badge--danger">Egreso</span>' }[t] || t; }
function renderCaja() {
  byId("cajaSaldo").textContent = money(cajaSaldo());
  byId("cajaApertura").textContent = money(sumTipo("apertura"));
  byId("cajaVentas").textContent = money(sumTipo("venta"));
  byId("cajaIngresos").textContent = money(sumTipo("ingreso"));
  byId("cajaEgresos").textContent = "– " + money(sumTipo("egreso"));
  var e = byId("cajaEstado"); e.className = "badge " + (DB.caja.abierta ? "badge--ok" : "badge--n"); e.textContent = DB.caja.abierta ? "Turno abierto" : "Turno cerrado";
  var b = byId("cajaArqueoBtn"); if (DB.caja.abierta) { b.textContent = "Arqueo y cierre"; b.onclick = cajaArqueo; } else { b.textContent = "Abrir caja"; b.onclick = cajaAbrir; }
  byId("cajaMovs").innerHTML = DB.caja.movimientos.slice().reverse().map(function (m) { return "<tr><td>" + m.hora + "</td><td>" + esc(m.concepto) + "</td><td>" + cajaBadge(m.tipo) + '</td><td class="num">' + (m.tipo === "egreso" ? "– " : "") + money(m.monto) + "</td></tr>"; }).join("");
}
function cajaMov(tipo) {
  if (!DB.caja.abierta) { toast("La caja está cerrada", "warn"); return; }
  openModal(tipo === "ingreso" ? "Ingreso a caja" : "Egreso de caja", fieldHtml("k_concepto", "Concepto", "") + fieldHtml("k_monto", "Monto $", 0, "number"), function () {
    var m = numv("k_monto"); if (m <= 0) { toast("Monto inválido", "warn"); return false; }
    DB.caja.movimientos.push({ hora: hhmm(), concepto: val("k_concepto").trim() || (tipo === "ingreso" ? "Ingreso manual" : "Egreso manual"), tipo: tipo, monto: m });
    save(); renderCaja(); toast("Movimiento registrado", "ok");
  }, "Registrar");
}
function cajaArqueo() {
  var teorico = cajaSaldo();
  openModal("Arqueo y cierre de turno", '<div class="kv"><span>Saldo teórico</span><b>' + money(teorico) + "</b></div>" + fieldHtml("k_fisico", "Conteo físico $", teorico, "number"), function () {
    var dif = numv("k_fisico") - teorico; DB.caja.abierta = false; save(); renderCaja();
    toast(dif === 0 ? "Caja cerrada · sin diferencias" : "Caja cerrada · diferencia " + money(dif), dif === 0 ? "ok" : "warn");
  }, "Cerrar turno");
}
function cajaAbrir() {
  openModal("Abrir caja", fieldHtml("k_ini", "Monto inicial $", 50000, "number"), function () {
    DB.caja.abierta = true; DB.caja.movimientos = [{ hora: hhmm(), concepto: "Apertura de caja", tipo: "apertura", monto: numv("k_ini") }]; save(); renderCaja(); toast("Caja abierta", "ok");
  }, "Abrir");
}

/* ---------------- CUENTAS CORRIENTES ---------------- */
function ctaEstado(c) {
  if (c.saldo > c.limite) return '<span class="badge badge--danger">Excedido</span>';
  if (c.saldo === 0) return '<span class="badge badge--ok">Sin deuda</span>';
  if (c.saldo > c.limite * 0.7) return '<span class="badge badge--warn">Por vencer</span>';
  return '<span class="badge badge--ok">Al día</span>';
}
function renderCuentas() {
  if (DB.ui.ctaTab === "proveedores") { byId("ctacteBody").innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center;padding:26px">Sin proveedores cargados en la demo</td></tr>'; return; }
  byId("ctacteBody").innerHTML = DB.clients.map(function (c) {
    return '<tr class="clickable" data-cli="' + c.id + '"><td class="strong">' + esc(c.nombre) + "</td><td>" + esc(c.cuit) + "</td><td>" + esc(c.condicion) + "</td>" +
      '<td class="num strong"' + (c.saldo > 0 ? ' style="color:var(--danger)"' : "") + ">" + money(c.saldo) + '</td><td class="num">' + money(c.limite) + "</td><td>" + ctaEstado(c) + "</td></tr>";
  }).join("");
}
function ctaTab(t) { DB.ui.ctaTab = t; setSeg("ctaSeg", t === "proveedores" ? 1 : 0); renderCuentas(); }
function verCliente(id) {
  var c = cliente(id); if (!c) return;
  var body = '<div class="kv"><span>CUIT / DNI</span><b>' + esc(c.cuit) + "</b></div>" +
    '<div class="kv"><span>Condición IVA</span><b>' + esc(c.condicion) + "</b></div>" +
    '<div class="kv"><span>Saldo deudor</span><b style="color:' + (c.saldo > 0 ? "var(--danger)" : "var(--ok)") + '">' + money(c.saldo) + "</b></div>" +
    '<div class="kv"><span>Límite de crédito</span><b>' + money(c.limite) + "</b></div>" +
    '<div class="kv"><span>Disponible</span><b>' + money(Math.max(0, c.limite - c.saldo)) + "</b></div>";
  openModal("Cliente: " + c.nombre, body, function () { closeModal(); registrarCobro(c.id); return false; }, c.saldo > 0 ? "Registrar cobro" : "Cerrar", "Cerrar");
}
function registrarCobro(preId) {
  var conDeuda = DB.clients.filter(function (c) { return c.saldo > 0; });
  if (!conDeuda.length) { toast("No hay clientes con deuda", "warn"); return; }
  var pre = preId || conDeuda[0].id;
  openModal("Registrar cobro", selectHtml("cb_cli", "Cliente", conDeuda.map(function (c) { return [c.id, c.nombre + " (debe " + money(c.saldo) + ")"]; }), pre) + fieldHtml("cb_monto", "Monto del cobro $", 0, "number"), function () {
    var c = cliente(val("cb_cli")), m = numv("cb_monto"); if (m <= 0) { toast("Monto inválido", "warn"); return false; }
    c.saldo = Math.max(0, c.saldo - m); DB.caja.movimientos.push({ hora: hhmm(), concepto: "Cobro Cta. Cte. — " + c.nombre, tipo: "ingreso", monto: m });
    save(); renderCuentas(); renderCaja(); toast("Cobro registrado", "ok");
  }, "Cobrar");
}
function nuevoCliente() {
  openModal("Nuevo cliente", fieldHtml("cl_nombre", "Nombre / Razón social", "") +
    '<div class="modal__row">' + fieldHtml("cl_cuit", "CUIT / DNI", "") + selectHtml("cl_cond", "Condición IVA", ["Resp. Inscripto", "Monotributo", "Consumidor Final", "Exento"], "Consumidor Final") + "</div>" +
    fieldHtml("cl_limite", "Límite de crédito $", 50000, "number"), function () {
    var nombre = val("cl_nombre").trim(); if (!nombre) { toast("Poné un nombre", "warn"); return false; }
    DB.clients.push({ id: "c" + Date.now(), nombre: nombre, cuit: val("cl_cuit").trim() || "—", condicion: val("cl_cond"), saldo: 0, limite: numv("cl_limite") });
    save(); renderCuentas(); toast("Cliente agregado", "ok");
  }, "Agregar");
}

/* ---------------- REPORTES ---------------- */
function renderReportes() {
  var act = ventasActivas();
  var byPago = { efectivo: 0, tarjeta: 0, mp: 0, ctacte: 0 };
  act.forEach(function (v) { byPago[v.pago] = (byPago[v.pago] || 0) + ventaTotal(v); });
  var tot = (byPago.efectivo + byPago.tarjeta + byPago.mp + byPago.ctacte) || 1;
  var pe = byPago.efectivo / tot, pt = byPago.tarjeta / tot, pm = byPago.mp / tot, pc = byPago.ctacte / tot;
  var a1 = pe * 100, a2 = a1 + pt * 100, a3 = a2 + pm * 100;
  byId("repDonut").style.background = "conic-gradient(var(--navy) 0 " + a1 + "%, var(--teal) " + a1 + "% " + a2 + "%, var(--teal-400) " + a2 + "% " + a3 + "%, #cdd9e6 " + a3 + "% 100%)";
  function lr(col, lab, f) { return '<div><i style="background:' + col + '"></i> ' + lab + " · " + Math.round(f * 100) + "%</div>"; }
  byId("repLegend").innerHTML = lr("var(--navy)", "Efectivo", pe) + lr("var(--teal)", "Tarjeta", pt) + lr("var(--teal-400)", "MercadoPago", pm) + lr("#cdd9e6", "Cuenta Cte.", pc);

  // Rentabilidad por rubro (calculada)
  var rub = {};
  act.forEach(function (v) { v.items.forEach(function (it) { var p = prod(it.pid); if (!p) return; rub[p.rubro] = (rub[p.rubro] || 0) + (it.precio - p.costo) * it.q; }); });
  var arr = Object.keys(rub).map(function (k) { return { r: k, g: rub[k] }; }).sort(function (a, b) { return b.g - a.g; }).slice(0, 5);
  var max = arr.reduce(function (m, x) { return Math.max(m, x.g); }, 1);
  byId("repRubros").innerHTML = arr.map(function (x) { return '<div class="bar b" style="height:' + Math.max(8, Math.round(x.g / max * 100)) + '%"><i>' + esc(x.r).slice(0, 7) + "</i></div>"; }).join("") || '<div class="muted">Sin datos</div>';

  // Resumen por comprobante
  var byTipo = {};
  act.forEach(function (v) {
    var t = tipoComprobante(DB.config.condicionIva, v.receptor || "CF"), total = ventaTotal(v);
    var disc = DB.config.condicionIva === "RI", neto = disc ? total / 1.21 : total, iva = total - neto;
    var o = byTipo[t] || (byTipo[t] = { c: 0, neto: 0, iva: 0, total: 0 }); o.c++; o.neto += neto; o.iva += iva; o.total += total;
  });
  var anuladas = DB.ventas.filter(function (v) { return v.anulada; });
  if (anuladas.length) {
    var nt = 0; anuladas.forEach(function (v) { nt += ventaTotal(v); });
    var disc = DB.config.condicionIva === "RI";
    byTipo["Nota de Crédito"] = { c: anuladas.length, neto: disc ? -nt / 1.21 : -nt, iva: disc ? -(nt - nt / 1.21) : 0, total: -nt };
  }
  byId("repResumen").innerHTML = Object.keys(byTipo).map(function (t) {
    var o = byTipo[t];
    return "<tr><td>" + t + '</td><td class="num">' + o.c + '</td><td class="num">' + money(o.neto) + '</td><td class="num">' + money(o.iva) + '</td><td class="num strong">' + money(o.total) + "</td></tr>";
  }).join("") || '<tr><td colspan="5" class="muted" style="text-align:center">Sin ventas</td></tr>';

  // Comprobantes del día
  byId("repComprob").innerHTML = DB.ventas.slice().reverse().map(function (v) {
    var t = v.anulada ? "—" : tipoComprobante(DB.config.condicionIva, v.receptor || "CF");
    var estado = v.anulada ? '<span class="badge badge--danger">Anulado</span>' : '<span class="badge badge--ok">Autorizado</span>';
    var accion = v.anulada ? '<span class="muted">NC emitida</span>' : '<button class="linkbtn" data-anular="' + v.n + '">Anular</button>';
    return "<tr><td>" + DB.config.puntoVenta + "-" + pad(v.n, 8) + "</td><td>" + v.hora + "</td><td>" + t + "</td><td>" + esc(nombreCliente(v)) + '</td><td class="num strong">' + money(ventaTotal(v)) + "</td><td>" + estado + "</td><td>" + accion + "</td></tr>";
  }).join("") || '<tr><td colspan="7" class="muted" style="text-align:center">Sin comprobantes</td></tr>';
}
function anular(n) {
  var v = DB.ventas.filter(function (x) { return x.n === n; })[0]; if (!v || v.anulada) return;
  v.anulada = true;
  v.items.forEach(function (it) { var p = prod(it.pid); if (p) p.stock = +(p.stock + it.q).toFixed(3); });
  if (v.pago === "efectivo") DB.caja.movimientos.push({ hora: hhmm(), concepto: "Nota de Crédito — anula #" + pad(v.n, 5), tipo: "egreso", monto: ventaTotal(v) });
  if (v.pago === "ctacte" && v.clienteId) { var c = cliente(v.clienteId); if (c) c.saldo = Math.max(0, c.saldo - ventaTotal(v)); }
  save(); renderReportes(); renderInicio(); renderStock(); renderCaja(); renderCuentas();
  toast("Nota de Crédito emitida · comprobante anulado", "ok");
}
function exportCSV(kind) {
  var rows = [["Fecha", "Comprobante", "Numero", "Cliente", "Neto", "IVA", "Total", "Pago", "Estado"]];
  DB.ventas.forEach(function (v) {
    var total = ventaTotal(v), disc = DB.config.condicionIva === "RI", neto = disc ? Math.round(total / 1.21) : total, iva = total - neto;
    var t = v.anulada ? "Nota de Credito" : tipoComprobante(DB.config.condicionIva, v.receptor || "CF").replace("ó", "o");
    rows.push([hoy(), t, DB.config.puntoVenta + "-" + pad(v.n, 8), nombreCliente(v), neto, iva, v.anulada ? -total : total, pagoLabel(v.pago), v.anulada ? "Anulado" : "Autorizado"]);
  });
  var csv = rows.map(function (r) { return r.join(";"); }).join("\r\n");
  download("nexosoft-" + kind + "-" + hoy().replace(/\//g, "-") + ".csv", csv);
  toast("Archivo generado: " + kind, "ok");
}
function download(name, text) {
  try {
    var b = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8;" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 800);
  } catch (e) { toast("No se pudo descargar en este navegador", "warn"); }
}

/* ---------------- CONFIG ---------------- */
function renderConfig() {
  setSeg("confSeg", DB.config.condicionIva === "Mono" ? 1 : 0);
  byId("confComprob").textContent = DB.config.condicionIva === "RI" ? "Factura A · B · NC · ND" : "Factura C · NC · ND";
  byId("confDiscrimina").textContent = DB.config.condicionIva === "RI" ? "Sí" : "No";
  byId("confRazon").textContent = DB.config.razonSocial;
  byId("confCuit").textContent = DB.config.cuit;
  byId("confPv").textContent = DB.config.puntoVenta;
}
function setCondicion(c) { DB.config.condicionIva = c; save(); renderConfig(); renderPOS(); renderReportes(); toast("Condición fiscal: " + (c === "RI" ? "Responsable Inscripto" : "Monotributo"), "ok"); }
function toggleSwitch(el, key) { el.classList.toggle("off"); if (key) { DB.config[key] = !el.classList.contains("off"); save(); } }
function resetDemo() {
  openModal("Reiniciar la demostración", '<p class="muted" style="margin:0">Se borran los cambios (ventas, artículos, stock, caja) y vuelve a los datos de ejemplo. ¿Confirmás?</p>', function () { try { localStorage.removeItem(STORE_KEY); } catch (e) {} location.reload(); }, "Sí, reiniciar");
}

/* ---------------- IA ---------------- */
function enviarIA() {
  var t = val("iaInput").trim(); if (!t) return;
  var body = byId("iaBody"); body.innerHTML += '<div class="msg msg--me">' + esc(t) + "</div>";
  var act = ventasActivas(), totalDia = act.reduce(function (s, v) { return s + ventaTotal(v); }, 0);
  var q = t.toLowerCase(), resp;
  if (q.indexOf("vend") >= 0 || q.indexOf("hoy") >= 0) resp = "Hoy llevás <b>" + act.length + "</b> comprobantes por <b>" + money(totalDia) + "</b>.";
  else if (q.indexOf("vendido") >= 0 || q.indexOf("más") >= 0) { var agg = {}; act.forEach(function (v) { v.items.forEach(function (it) { agg[it.pid] = (agg[it.pid] || 0) + it.q; }); }); var top = Object.keys(agg).sort(function (a, b) { return agg[b] - agg[a]; })[0]; resp = top ? "El más vendido es <b>" + esc(prod(top).nombre) + "</b>." : "Todavía no hay ventas."; }
  else resp = "Según tus datos: <b>" + act.length + "</b> ventas por <b>" + money(totalDia) + "</b> hoy.";
  body.innerHTML += '<div class="msg msg--ia">' + resp + ' <span class="muted">(respuesta simulada · solo lectura)</span></div>';
  byId("iaInput").value = ""; body.scrollTop = body.scrollHeight;
}

/* ---------------- Modal / Toast ---------------- */
var modalOk = null, modalCancelFn = null;
function openModal(title, bodyHtml, onConfirm, confirmLabel, cancelLabel, onCancel) {
  byId("modalTitle").textContent = title; byId("modalBody").innerHTML = bodyHtml;
  byId("modalConfirm").textContent = confirmLabel || "Guardar"; byId("modalCancel").textContent = cancelLabel || "Cancelar";
  modalOk = onConfirm || null; modalCancelFn = onCancel || null; byId("modal").classList.add("modal--show");
}
function closeModal() { byId("modal").classList.remove("modal--show"); modalOk = null; modalCancelFn = null; }
function modalConfirm() { if (modalOk && modalOk() === false) return; closeModal(); }
function modalCancel() { if (modalCancelFn && modalCancelFn() === false) return; closeModal(); }
var toastT;
function toast(msg, type) { var t = byId("toast"); t.textContent = msg; t.className = "toast toast--show" + (type ? " toast--" + type : ""); clearTimeout(toastT); toastT = setTimeout(function () { t.className = "toast"; }, 2600); }
function demo(msg) { toast(msg || "Función de demostración (maqueta)"); }

/* ---------------- Login / shell ---------------- */
function entrar() { byId("login").style.display = "none"; byId("app").style.display = "grid"; }
function logout() { byId("app").style.display = "none"; byId("login").style.display = "grid"; closeNav(); }
function toggleNav() { document.querySelector(".sidebar").classList.toggle("sidebar--open"); document.querySelector(".nav-backdrop").classList.toggle("nav-backdrop--show"); }
function closeNav() { document.querySelector(".sidebar").classList.remove("sidebar--open"); document.querySelector(".nav-backdrop").classList.remove("nav-backdrop--show"); }
function globalSearch(e) { if (e.key === "Enter") { var q = e.target.value.trim(); if (!q) return; go("catalogo"); var s = byId("catSearch"); if (s) { s.value = q; renderCatalogo(); } } }

/* ---------------- Init ---------------- */
load();
(function () { var sel = byId("catRubro"); if (sel) sel.innerHTML = '<option value="Todos">Rubro: todos</option>' + selOpts(rubros(), "Todos"); })();

// Delegación de eventos en listas dinámicas
byId("posProducts").addEventListener("click", function (e) { var b = e.target.closest("[data-add]"); if (b) posAdd(b.dataset.add); });
byId("posCats").addEventListener("click", function (e) { var b = e.target.closest("[data-cat]"); if (b) posSetCat(b.dataset.cat); });
byId("posItems").addEventListener("click", function (e) { var s = e.target.closest("[data-step]"); if (s) { posStep(s.dataset.id, +s.dataset.step); return; } var x = e.target.closest("[data-del]"); if (x) posRemove(x.dataset.del); });
byId("ticketCli").addEventListener("click", function (e) { if (e.target.closest("#cliPick")) elegirCliente(); });
byId("catalogoBody").addEventListener("click", function (e) { var t = e.target.closest("tr[data-edit]"); if (t) openProductModal(t.dataset.edit); });
byId("ctacteBody").addEventListener("click", function (e) { var t = e.target.closest("tr[data-cli]"); if (t) verCliente(t.dataset.cli); });
byId("repComprob").addEventListener("click", function (e) { var b = e.target.closest("[data-anular]"); if (b) anular(+b.dataset.anular); });

// Navegación
byId("nav").addEventListener("click", function (e) {
  var item = e.target.closest(".nav-item"); if (!item) return;
  document.querySelectorAll(".nav-item").forEach(function (n) { n.classList.remove("nav-item--active"); });
  item.classList.add("nav-item--active");
  var target = item.dataset.target;
  document.querySelectorAll(".screen").forEach(function (s) { s.classList.toggle("screen--active", s.id === target); });
  byId("pageTitle").textContent = item.dataset.title; byId("pageCrumb").textContent = item.dataset.crumb;
  if (RENDERERS[target]) RENDERERS[target](); byId("content").scrollTop = 0; closeNav();
});

Object.keys(RENDERERS).forEach(function (k) { try { RENDERERS[k](); } catch (e) {} });

(function clock() { var d = new Date(); byId("clock").textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); setTimeout(clock, 20000); })();

document.querySelectorAll(".logo__img").forEach(function (img) { function ok() { var l = img.closest(".logo"); if (l) l.classList.add("has-logo"); } if (img.complete && img.naturalWidth > 0) ok(); else img.addEventListener("load", ok); });
