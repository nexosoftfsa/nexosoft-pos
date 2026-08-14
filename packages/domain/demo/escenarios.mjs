// Demo ejecutable del dominio NexoSoft (Fases 1.1 + 1.2).
// Corre la lógica REAL (compilada en dist/) con escenarios de un comercio.
// Uso:  pnpm --filter @nexosoft/domain run build  &&  node demo/escenarios.mjs
import {
  ALICUOTAS_IVA,
  CondicionIva,
  FormaDePago,
  Money,
  TipoComprobante,
  ahorroCombo,
  calcularCobro,
  calcularComprobante,
  calcularMargen,
  calcularPrecioVenta,
  crearCombo,
  calcularDescuentoPromocion,
  resolverTipoComprobante,
  TipoPromocion,
} from "../dist/index.js";

// Formateo de pesos al estilo argentino: $ 1.210,00
function $(m) {
  const s = m.aDecimalString(2);
  const neg = s.startsWith("-");
  const [ent, dec] = s.replace("-", "").split(".");
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg ? "-" : ""}$ ${miles},${dec}`;
}
const titulo = (t) => console.log(`\n\x1b[1m\x1b[36m${t}\x1b[0m`);

console.log("\x1b[1m═══ NexoSoft · Demo del dominio (Fases 1.1 + 1.2) ═══\x1b[0m");

// 1 ──────────────────────────────────────────────────────────────
titulo("1) Dinero exacto (sin errores de float)");
console.log(`   0,10 + 0,20 = ${$(Money.desde("0.10").sumar(Money.desde("0.20")))}   (con float: 0.30000000000000004)`);
console.log(`   2,675 redondeado a 2 decimales = ${$(Money.desde("2.675").redondear(2))}`);
console.log(`   1,250 kg × $ 980,00/kg = ${$(Money.desde("980").multiplicarPor("1.250"))}`);

// 2 ──────────────────────────────────────────────────────────────
titulo("2) Tipo de comprobante según condición fiscal (ADR-0012)");
const casos = [
  [CondicionIva.ResponsableInscripto, CondicionIva.ResponsableInscripto],
  [CondicionIva.ResponsableInscripto, CondicionIva.ConsumidorFinal],
  [CondicionIva.Monotributo, CondicionIva.ConsumidorFinal],
];
for (const [emisor, receptor] of casos) {
  console.log(`   Emisor ${emisor.padEnd(20)} → Receptor ${receptor.padEnd(18)} ⇒ ${resolverTipoComprobante(emisor, receptor)}`);
}

// 3 ──────────────────────────────────────────────────────────────
titulo("3) Factura B a Consumidor Final (IVA incluido, no se discrimina)");
const fb = calcularComprobante(
  [{ descripcion: "Gaseosa 1,5L", cantidad: 1, precioUnitario: Money.desde("1210.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO }],
  { tipo: TipoComprobante.FacturaB },
);
console.log(`   1 × Gaseosa 1,5L .......... ${$(Money.desde("1210.00"))}`);
console.log(`   Neto $ ${fb.netoGravado.aDecimalString()}  +  IVA 21% $ ${fb.iva.aDecimalString()}  =  TOTAL ${$(fb.total)}`);

// 4 ──────────────────────────────────────────────────────────────
titulo("4) Factura A multi-alícuota con 10% de descuento global (discrimina IVA)");
const fa = calcularComprobante(
  [
    { descripcion: "Vino (21%)", cantidad: 2, precioUnitario: Money.desde("3025.00"), alicuota: ALICUOTAS_IVA.VEINTIUNO },
    { descripcion: "Leche (10,5%)", cantidad: 3, precioUnitario: Money.desde("1105.00"), alicuota: ALICUOTAS_IVA.DIEZ_CON_CINCO },
  ],
  { tipo: TipoComprobante.FacturaA, descuentoPorcentaje: 10 },
);
console.log(`   2 × Vino $ 3.025,00  +  3 × Leche $ 1.105,00`);
console.log(`   Bruto ${$(fa.brutoSinDescuento)}  −  Descuento 10% ${$(fa.descuento)}`);
for (const s of fa.subtotalesPorAlicuota) {
  console.log(`   IVA ${s.alicuota.etiqueta.padEnd(5)}: neto ${$(s.neto)}  ·  IVA ${$(s.iva)}`);
}
console.log(`   Neto total ${$(fa.netoGravado)}  +  IVA ${$(fa.iva)}  =  TOTAL ${$(fa.total)}`);
console.log(`   ✔ Invariante neto + IVA = total: ${fa.netoGravado.sumar(fa.iva).igualA(fa.total)}`);

// 5 ──────────────────────────────────────────────────────────────
titulo("5) Precio desde costo según régimen (costo neto $100, margen 50%, IVA 21%) — ADR-0014");
const costo = Money.desde("100.00");
const ri = calcularPrecioVenta(costo, 50, ALICUOTAS_IVA.VEINTIUNO, { condicionEmisor: CondicionIva.ResponsableInscripto });
const mono = calcularPrecioVenta(costo, 50, ALICUOTAS_IVA.VEINTIUNO, { condicionEmisor: CondicionIva.Monotributo });
console.log(`   Responsable Inscripto: neto ${$(ri.precioNetoVenta)} + IVA ${$(ri.ivaVenta)} = ${$(ri.precioFinal)}`);
console.log(`   Monotributo:           base con IVA ${$(mono.costoConsiderado)}, sin IVA de venta = ${$(mono.precioFinal)}`);
console.log(`   Margen que implica $181,50 (RI): ${calcularMargen(costo, Money.desde("181.50"), ALICUOTAS_IVA.VEINTIUNO, { condicionEmisor: CondicionIva.ResponsableInscripto })}%`);

// 6 ──────────────────────────────────────────────────────────────
titulo("6) Promoción 3x2 y Combo");
const promo = { id: "p", nombre: "3x2", tipo: TipoPromocion.LlevaPaga, llevaN: 3, pagaM: 2 };
const desc = calcularDescuentoPromocion(promo, { cantidad: 6, precioUnitario: Money.desde("100.00") });
console.log(`   3x2 sobre 6 unidades de $100 → descuento ${$(desc)} (pagás 4, llevás 6)`);
const combo = crearCombo({
  nombre: "Combo merienda",
  items: [{ articuloId: "cafe", cantidad: 1 }, { articuloId: "medialuna", cantidad: 3 }],
  precioCombo: Money.desde("2000.00"),
});
const precios = new Map([["cafe", Money.desde("1500.00")], ["medialuna", Money.desde("400.00")]]);
console.log(`   Combo merienda: café $1.500 + 3 medialunas $400 = $2.700 → combo $2.000 → ahorro ${$(ahorroCombo(combo, precios))}`);

// 7 ──────────────────────────────────────────────────────────────
titulo("7) Cobro combinado (varios medios de pago en una venta)");
const cobro = calcularCobro(Money.desde("1210.00"), [
  { forma: FormaDePago.Tarjeta, monto: Money.desde("1000.00") },
  { forma: FormaDePago.Efectivo, monto: Money.desde("300.00") },
]);
console.log(`   Total ${$(cobro.total)}  =  Tarjeta $1.000,00 + Efectivo $300,00 → pagado ${$(cobro.pagado)}`);
console.log(`   Vuelto (solo efectivo) ${$(cobro.vuelto)}  ·  ¿cancelada? ${cobro.cancelada}`);

console.log("\n\x1b[1m\x1b[32m✓ Todos los cálculos los hizo el dominio real (@nexosoft/domain).\x1b[0m\n");
