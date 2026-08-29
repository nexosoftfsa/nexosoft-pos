/**
 * Traduce un `DatosTicket` a bytes ESC/POS para una térmica de 58mm.
 *
 * Función pura (sin I/O): el transporte lo hace el adaptador de Tauri. Así
 * el formato del ticket se puede testear sin impresora.
 *
 * Por qué ESC/POS y no imprimir el HTML: por el navegador, el ticket es una
 * página de oficina y el driver de una térmica declara un rollo de 3276mm de
 * largo, así que cada venta desperdiciaba papel, el corte no se controlaba y
 * se abría un diálogo. Acá el papel avanza sólo lo que se imprimió y el corte
 * es un comando.
 */
import type { DatosTicket } from "./impresora.js";

/** Caracteres por línea en fuente A (12x24) sobre papel de 58mm. */
export const COLUMNAS_58MM = 32;

/** Ancho en puntos de un carácter de fuente A: 32 columnas = 384 puntos. */
export const PUNTOS_POR_COLUMNA = 12;

/**
 * Logo ya convertido a mapa de bits monocromo, listo para `GS v 0`.
 * La conversión desde el PNG/JPG del comercio vive en la app (necesita
 * `canvas`); acá solo se empaqueta, así el comando queda testeable.
 */
export interface LogoRaster {
  /** Ancho en puntos (píxeles). Máximo 384 en una térmica de 58mm. */
  readonly anchoPuntos: number;
  readonly alto: number;
  /** 1 bit por punto, 8 por byte, MSB primero. Un bit en 1 = punto negro. */
  readonly bits: Uint8Array;
}

// --- Comandos ESC/POS ------------------------------------------------------
const ESC = 0x1b;
const GS = 0x1d;

const INICIALIZAR = [ESC, 0x40]; // ESC @
const ALINEAR_IZQ = [ESC, 0x61, 0]; // ESC a 0
const ALINEAR_CENTRO = [ESC, 0x61, 1];
const NEGRITA_ON = [ESC, 0x45, 1]; // ESC E 1
const NEGRITA_OFF = [ESC, 0x45, 0];
const DOBLE_ALTO = [GS, 0x21, 0x01]; // GS ! — alto doble, ancho normal
const TAMANO_NORMAL = [GS, 0x21, 0x00];
/** GS V 66 n: avanza n puntos y corta. Deja pestaña para agarrar el ticket. */
const CORTAR = [GS, 0x56, 0x42, 0x00];

/** Matriz de módulos de un QR: `data` trae un byte por módulo (0 = blanco). */
export interface ModulosQr {
  readonly size: number;
  readonly data: Uint8Array | readonly number[];
}

/**
 * Zona silenciosa alrededor del QR, en módulos. La norma pide 4; sin ella
 * muchos lectores no enganchan el código, sobre todo pegado a texto.
 */
const MARGEN_QR = 4;

/**
 * Convierte los módulos de un QR en un mapa de bits para `GS v 0`.
 *
 * El QR fiscal se imprime como IMAGEN y no con los comandos nativos de QR de
 * ESC/POS (`GS ( k`) a propósito: esos comandos no los soporta todo modelo, y
 * si el modelo no los entiende imprime basura o nada — y nadie se entera hasta
 * que un cliente no puede escanear su comprobante. El camino de imagen es el
 * mismo que ya usa el logo del comercio: si el logo sale, el QR sale.
 *
 * La escala se calcula para ocupar el ancho disponible sin pasarse: un QR más
 * grande se escanea mejor, y el papel térmico da lo que da.
 */
export function qrARaster(modulos: ModulosQr, anchoMaxPuntos: number): LogoRaster {
  const lado = modulos.size + MARGEN_QR * 2;
  const escala = Math.max(1, Math.floor(anchoMaxPuntos / lado));
  const anchoPuntos = lado * escala;
  const bytesPorFila = Math.ceil(anchoPuntos / 8);
  const bits = new Uint8Array(bytesPorFila * anchoPuntos);

  for (let fila = 0; fila < modulos.size; fila++) {
    for (let col = 0; col < modulos.size; col++) {
      if (modulos.data[fila * modulos.size + col] === 0) continue;
      // Cada módulo es un cuadrado de `escala` puntos.
      for (let dy = 0; dy < escala; dy++) {
        const y = (fila + MARGEN_QR) * escala + dy;
        for (let dx = 0; dx < escala; dx++) {
          const x = (col + MARGEN_QR) * escala + dx;
          bits[y * bytesPorFila + (x >> 3)]! |= 0x80 >> (x & 7);
        }
      }
    }
  }

  return { anchoPuntos, alto: anchoPuntos, bits };
}

/**
 * `GS v 0`: imprime un mapa de bits. El ancho va en BYTES por fila (no en
 * puntos) y tanto el ancho como el alto viajan en dos bytes little-endian.
 */
export function comandoImagenRaster(logo: LogoRaster): number[] {
  const bytesPorFila = Math.ceil(logo.anchoPuntos / 8);
  const esperados = bytesPorFila * logo.alto;
  if (logo.bits.length !== esperados) {
    throw new Error(
      `El logo dice ${logo.anchoPuntos}x${logo.alto} (${esperados} bytes) pero trae ${logo.bits.length}.`,
    );
  }
  return [
    GS,
    0x76,
    0x30,
    0x00, // m = 0 (tamaño normal)
    bytesPorFila & 0xff,
    (bytesPorFila >> 8) & 0xff,
    logo.alto & 0xff,
    (logo.alto >> 8) & 0xff,
    ...logo.bits,
  ];
}

/**
 * Pasa el texto a ASCII imprimible. Las térmicas usan páginas de código de
 * DOS (437/850/858) que varían por modelo; transliterar evita que "CAÑUELAS"
 * salga como caracteres raros en un modelo que esperaba otra tabla.
 */
export function aAsciiImprimible(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/[^\x20-\x7e]/g, " "); // cualquier otro no imprimible → espacio
}

/** Corta el texto a `ancho` columnas. */
function recortar(texto: string, ancho: number): string {
  return texto.length > ancho ? texto.slice(0, ancho) : texto;
}

/**
 * Formatea un `Money` al estilo argentino: `$ 1.850,00`. Mismo criterio que
 * `pesos()` en el POS — no se puede importar de ahí (este paquete no depende
 * de la app), así que la regla se repite acá y la cubren los tests.
 */
export function pesosTicket(m: { aDecimalString(decimales?: number): string }): string {
  const s = m.aDecimalString(2);
  const negativo = s.startsWith("-");
  const [entero = "0", decimal = "00"] = s.replace("-", "").split(".");
  const conMiles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}$ ${conMiles},${decimal}`;
}

/** Una línea con texto a la izquierda y a la derecha, separados por espacios. */
export function filaIzquierdaDerecha(
  izquierda: string,
  derecha: string,
  columnas = COLUMNAS_58MM,
): string {
  const der = recortar(derecha, columnas);
  const espacioIzq = Math.max(0, columnas - der.length - 1);
  const izq = recortar(izquierda, espacioIzq);
  const relleno = columnas - izq.length - der.length;
  return izq + " ".repeat(Math.max(1, relleno)) + der;
}

/**
 * Parte un texto largo en varias líneas del ancho del papel, cortando por
 * palabra. Sin esto, una descripción larga se pasa del ancho y la impresora
 * la envuelve donde le queda cómodo (o la recorta, según el modelo).
 */
export function envolver(texto: string, columnas = COLUMNAS_58MM): string[] {
  const palabras = texto.split(/\s+/).filter((p) => p !== "");
  if (palabras.length === 0) return [""];
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of palabras) {
    // Una palabra sola más larga que el renglón se parte a lo bruto.
    if (palabra.length > columnas) {
      if (actual !== "") {
        lineas.push(actual);
        actual = "";
      }
      for (let i = 0; i < palabra.length; i += columnas) {
        lineas.push(palabra.slice(i, i + columnas));
      }
      continue;
    }
    if (actual === "") actual = palabra;
    else if (actual.length + 1 + palabra.length <= columnas) actual += ` ${palabra}`;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual !== "") lineas.push(actual);
  return lineas;
}

/** Centra el texto en el ancho del papel. */
export function centrar(texto: string, columnas = COLUMNAS_58MM): string {
  const t = recortar(texto, columnas);
  const izq = Math.floor((columnas - t.length) / 2);
  return " ".repeat(Math.max(0, izq)) + t;
}

function fecha(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Acumula texto y comandos y los serializa a bytes. */
class Buffer {
  private readonly partes: number[] = [];

  constructor(private readonly columnas: number) {}

  comando(bytes: readonly number[]): this {
    this.partes.push(...bytes);
    return this;
  }

  /**
   * Escribe texto y salta de renglón. Pasa a ASCII y ENVUELVE al ancho del
   * papel siempre: que ninguna línea se pase es responsabilidad de acá, no de
   * cada quien que llame (olvidarse en un solo lugar rompe el ticket).
   */
  linea(texto = ""): this {
    const renglones = texto === "" ? [""] : envolver(aAsciiImprimible(texto), this.columnas);
    for (const renglon of renglones) {
      for (let i = 0; i < renglon.length; i++) this.partes.push(renglon.charCodeAt(i));
      this.partes.push(0x0a);
    }
    return this;
  }

  /** Línea que ya viene armada al ancho exacto (separadores, filas izq/der). */
  lineaCruda(texto: string): this {
    const limpio = aAsciiImprimible(texto);
    for (let i = 0; i < limpio.length; i++) this.partes.push(limpio.charCodeAt(i));
    this.partes.push(0x0a);
    return this;
  }

  separador(): this {
    return this.lineaCruda("-".repeat(this.columnas));
  }

  aBytes(): Uint8Array {
    return Uint8Array.from(this.partes);
  }
}

/**
 * Arma el ticket completo en ESC/POS, listo para mandar a la impresora.
 *
 * @param columnas Ancho del papel en caracteres (32 = 58mm, 48 = 80mm).
 * @param logo Logo del comercio ya rasterizado. La conversión desde el
 *   `logoDataUrl` la hace la app (ver `impresora-escpos.ts`), porque necesita
 *   `canvas` y este paquete tiene que poder correr en Node para los tests.
 */
export function construirEscPos(
  datos: DatosTicket,
  columnas = COLUMNAS_58MM,
  logo?: LogoRaster,
  qrFiscal?: LogoRaster,
): Uint8Array {
  const b = new Buffer(columnas);
  const pesos = pesosTicket;

  b.comando(INICIALIZAR);

  // --- Cabecera del comercio (centrada) ---
  b.comando(ALINEAR_CENTRO);
  if (logo) b.comando(comandoImagenRaster(logo)).linea();
  b.comando(NEGRITA_ON).linea(datos.razonSocial).comando(NEGRITA_OFF);
  b.linea(`CUIT ${datos.cuit}`);
  b.linea(datos.condicionIvaEmisor);
  b.linea(`PV ${String(datos.puntoDeVenta).padStart(4, "0")}`);
  b.linea();

  // --- Comprobante ---
  b.comando(NEGRITA_ON).linea(datos.tipoComprobante).comando(NEGRITA_OFF);
  const numero = `${String(datos.puntoDeVenta).padStart(4, "0")}-${String(datos.numero).padStart(8, "0")}`;
  b.linea(`N ${numero}`);
  b.linea(fecha(datos.fecha));
  if (datos.esFiscal === false) {
    b.comando(NEGRITA_ON).linea("NO VALIDO COMO FACTURA").comando(NEGRITA_OFF);
  }

  // --- Ítems ---
  b.comando(ALINEAR_IZQ);
  b.separador();
  for (const l of datos.lineas) {
    b.linea(l.descripcion);
    const cant = l.cantidad.esEntera() ? l.cantidad.aDecimalString(0) : l.cantidad.aDecimalString(3);
    b.lineaCruda(filaIzquierdaDerecha(`${cant} x ${pesos(l.precioUnitario)}`, pesos(l.importe), columnas));
  }
  b.separador();

  // --- Totales ---
  if (datos.descuento.esPositivo()) {
    b.lineaCruda(filaIzquierdaDerecha("Descuento", `-${pesos(datos.descuento)}`, columnas));
  }
  for (const s of datos.subtotalesIva) {
    b.lineaCruda(filaIzquierdaDerecha(s.etiqueta, pesos(s.iva), columnas));
  }
  b.comando(NEGRITA_ON).comando(DOBLE_ALTO);
  // A alto doble entran las mismas columnas (solo cambia la altura).
  b.lineaCruda(filaIzquierdaDerecha("TOTAL", pesos(datos.total), columnas));
  b.comando(TAMANO_NORMAL).comando(NEGRITA_OFF);

  // --- Cobro ---
  for (const f of datos.formasDePago) {
    b.lineaCruda(filaIzquierdaDerecha(f.etiqueta, pesos(f.monto), columnas));
  }
  if (datos.vuelto.esPositivo()) {
    b.comando(NEGRITA_ON);
    b.lineaCruda(filaIzquierdaDerecha("VUELTO", pesos(datos.vuelto), columnas));
    b.comando(NEGRITA_OFF);
  }

  // --- Pie ---
  if (datos.cae !== undefined) {
    b.separador();
    b.linea(`CAE ${datos.cae}`);
    if (datos.vencimientoCae) b.linea(`Vto. ${fecha(datos.vencimientoCae)}`);
  }
  b.comando(ALINEAR_CENTRO);

  // El QR fiscal (RG 4892/2020) va en el ticket de papel, no sólo en el A4:
  // es el ticket lo que se lleva el cliente. Un comprobante electrónico sin QR
  // está mal emitido.
  if (qrFiscal !== undefined) {
    b.linea();
    b.comando(comandoImagenRaster(qrFiscal));
    b.linea();
  }

  b.linea();
  if (datos.esFiscal === false) b.linea("Documento interno, sin validez fiscal");
  b.linea("Gracias por su compra");

  // Corte: el papel avanzó sólo lo impreso, así que corta justo acá.
  b.comando(CORTAR);
  return b.aBytes();
}
