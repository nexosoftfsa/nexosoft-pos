import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { EstadoFiscal, MedioPago, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MotorDeRespaldo } from '../respaldo/motor-de-respaldo';
import {
  ALICUOTAS_IVA,
  codigoComprobanteArcaOpcional,
  desglosarIvaIncluido,
  desgloseSinDiscriminar,
  letraDe,
  Money,
  type DesgloseIva,
  type TipoComprobante,
} from '@nexosoft/domain';
import type { ReceptorArca } from './cae/receptor-arca';
import {
  ErrorCaeNoDisponible,
  ErrorCaeRechazado,
  SERVICIO_CAE,
  type ComprobanteAsociadoSolicitud,
  type ResultadoCae,
  type ServicioCae,
} from './cae/servicio-cae';
import { comprobanteAsociadoDe } from './cae/comprobante-asociado';
import { aDesglosePersistido } from './cae/desglose-persistido';
import { fueraDeVentanaArca, motivoVentanaVencida } from './cae/ventana-de-fecha';
import { fechaDeVenta } from './fecha-de-venta';
import { DesgloseDeVentaService } from './cae/desglose-de-venta.service';
import { LIBRO_DE_VENTAS, type LibroDeVentas } from './libro/libro-de-ventas';
import type { CrearVentaDto } from './dto/crear-venta.dto';
import type { EmitirNotaDebitoDto } from './dto/emitir-nota-debito.dto';
import { expandirStockDeVenta, type ComponenteCombo } from './combo';
import { asignarFefo, type LoteConSaldo } from '../stock/fefo';

/** Un tramo de salida de stock: cantidad y (para perecederos) el lote imputado. */
interface TramoStock {
  productoId: string;
  cantidad: Decimal;
  loteId: string | null;
}

interface UsuarioCtx {
  id: string;
  email: string;
  sucursalId: string;
}

type Tx = Prisma.TransactionClient;

@Injectable()
export class VentasService {
  private readonly logger = new Logger(VentasService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVICIO_CAE) private readonly cae: ServicioCae,
    @Inject(LIBRO_DE_VENTAS) private readonly libro: LibroDeVentas,
    private readonly motor: MotorDeRespaldo,
    private readonly config: ConfigService,
    private readonly desgloses: DesgloseDeVentaService,
  ) {}

  historial(sucursalId: string) {
    return this.prisma.venta.findMany({
      where: { sucursalId },
      orderBy: { creadaEn: 'desc' },
      include: {
        items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
        pagos: true,
        // Una Nota de Crédito tiene que decir en el papel qué comprobante
        // corrige, no sólo en el `CbtesAsoc` que va a ARCA. Con el id solo no
        // alcanza: hace falta el tipo y el número para poder imprimirlo.
        comprobanteAsociado: { select: { tipoComprobante: true, numeroComprobante: true } },
        // Datos del receptor para reimprimir una Factura A/B: ARCA exige nombre
        // y CUIT en el papel de la A, y en la B con cliente identificado el
        // ticket los muestra también.
        cliente: {
          select: { nombre: true, documento: true, condicionIva: true, direccion: true },
        },
      },
    });
  }

  /**
   * Cuántos comprobantes están esperando el CAE, para que el POS lo pueda
   * mostrar.
   *
   * Hace falta porque el indicador de la terminal habla de la SINCRONIZACIÓN
   * con el servidor, y desde que eso dejó de depender de internet (ADR-0066)
   * dice "Sincronizado" aunque ARCA esté inalcanzable: las ventas suben bien y
   * se acumulan sin CAE, sin que nadie lo vea. Son dos caminos distintos y el
   * cajero necesita ver los dos.
   *
   * `vencidas` son las que ARCA ya no va a autorizar por fecha
   * (`ventana-de-fecha.ts`): ésas no se arreglan esperando, hay que
   * regularizarlas con el contador.
   */
  async esperandoCae(sucursalId: string) {
    // Se traen las fechas y se cuenta acá: una pendiente es una excepción, y si
    // alguna vez hubiera miles, ese número ES la alarma.
    const pendientes = await this.prisma.venta.findMany({
      where: { sucursalId, estadoFiscal: 'PENDIENTE' },
      select: { creadaEn: true },
      orderBy: { creadaEn: 'asc' },
    });
    const ahora = new Date();
    return {
      cantidad: pendientes.length,
      masAntigua: pendientes[0]?.creadaEn.toISOString() ?? null,
      vencidas: pendientes.filter((v) => fueraDeVentanaArca(v.creadaEn, ahora)).length,
    };
  }

  async obtener(sucursalId: string, id: string) {
    const venta = await this.prisma.venta.findFirst({
      where: { id, sucursalId },
      include: {
        items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
        pagos: true,
        // Una Nota de Crédito tiene que decir en el papel qué comprobante
        // corrige, no sólo en el `CbtesAsoc` que va a ARCA. Con el id solo no
        // alcanza: hace falta el tipo y el número para poder imprimirlo.
        comprobanteAsociado: { select: { tipoComprobante: true, numeroComprobante: true } },
        // Datos del receptor para reimprimir una Factura A/B: ARCA exige nombre
        // y CUIT en el papel de la A, y en la B con cliente identificado el
        // ticket los muestra también.
        cliente: {
          select: { nombre: true, documento: true, condicionIva: true, direccion: true },
        },
      },
    });
    if (!venta) throw new NotFoundException(`Comprobante ${id} no encontrado`);
    return venta;
  }

  /**
   * Anula un comprobante emitiendo una Nota de Crédito por el total (comprobante
   * asociado + CAE mock), marca el original ANULADO y restaura el stock vendido.
   * Todo en una transacción. Ver ADR-0028.
   */
  async anular(sucursalId: string, id: string) {
    const original = await this.obtener(sucursalId, id);
    if (original.estado === 'ANULADA') {
      throw new BadRequestException('El comprobante ya está anulado');
    }
    // Ninguna nota se anula. Anular una NC sería emitir una NC de una NC, y
    // anular una ND es exactamente lo que hace una NC sobre la factura.
    if (original.tipoComprobante?.startsWith('Nota')) {
      throw new BadRequestException('No se puede anular una nota de crédito ni de débito');
    }

    const tipoNc = notaCreditoDe(original.tipoComprobante);
    // La Nota de Crédito refleja el mismo desglose que el original.
    const desgloseNc = await this.desgloses.deLineas(
      original.items.map((it) => ({ productoId: it.productoId, subtotal: it.subtotal })),
      tipoNc,
      original.total,
    );
    // Fase 10.1: un TicketNoFiscal no tiene Nota de Crédito (no es fiscal) — se
    // anula reflejando el mismo tipo, sin pedir CAE.
    //
    // Igual que en la venta: si ARCA no responde, la anulación se registra y el
    // CAE de la Nota de Crédito se consigue después. Devolverle la plata a un
    // cliente no puede depender de que AFIP esté en línea.
    // La NC va al mismo receptor que la factura que anula.
    const receptorNc = await this.desgloses.receptorDe(original.clienteId ?? null);
    // ARCA exige que la Nota de Crédito diga qué comprobante corrige: sin
    // `CbtesAsoc` la rechaza. Sale del original que se está anulando.
    const asociados = comprobanteAsociadoDe(original);
    const fiscal = await this.pedirCae(
      tipoNc,
      original.total,
      sucursalId,
      desgloseNc,
      receptorNc,
      // La nota de crédito se emite AHORA, no en la fecha de la venta que
      // anula: es un comprobante nuevo, con su propia fecha.
      new Date(),
      asociados,
    );
    const cae = fiscal.cae;

    const notaCredito = await this.conNumeroUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const tipoFinal = cae?.tipoComprobante ?? tipoNc;
        const numeroComprobante =
          cae?.numeroComprobante ??
          (await this.siguienteNumeroNoFiscal(tx, sucursalId, tipoFinal));
        const nc = await tx.venta.create({
          data: {
            operacionId: `${original.operacionId}-NC`,
            estado: 'COMPLETADA',
            subtotal: original.subtotal,
            descuento: original.descuento,
            total: original.total,
            medioPago: original.medioPago,
            cae: cae?.cae ?? null,
            caeFechaVto: cae?.caeFechaVto ?? null,
            estadoFiscal: fiscal.estadoFiscal,
            motivoFiscal: fiscal.motivo,
            numeroComprobante,
            tipoComprobante: tipoFinal,
            sucursalId,
            usuarioId: original.usuarioId,
            terminalId: original.terminalId,
            comprobanteAsociadoId: original.id,
            // El desglose declarado a ARCA, congelado para la reimpresión.
            ...aDesglosePersistido(desgloseNc),
            items: {
              create: original.items.map((it) => ({
                cantidad: it.cantidad,
                precioUnitario: it.precioUnitario,
                descuento: it.descuento,
                subtotal: it.subtotal,
                productoId: it.productoId,
              })),
            },
          },
          include: { items: true },
        });

        // La mercadería vuelve al stock. Espejamos los movimientos VENTA reales de
        // la venta original (no sus ítems): así un combo restaura el stock de sus
        // componentes exactamente como se descontó, sin depender de la composición
        // actual del combo (ADR-0033).
        const movimientosVenta = await tx.movimientoStock.findMany({
          where: { ventaId: original.id, tipo: 'VENTA' },
        });
        const motivo = `Anulación ${original.tipoComprobante ?? ''} ${original.numeroComprobante ?? ''}`.trim();
        for (const m of movimientosVenta) {
          await tx.movimientoStock.create({
            data: {
              tipo: 'ENTRADA',
              cantidad: m.cantidad,
              motivo,
              productoId: m.productoId,
              sucursalId,
              ventaId: nc.id,
              // Devuelve la mercadería al MISMO lote del que salió (perecederos).
              loteId: m.loteId ?? null,
            },
          });
        }

        await tx.venta.update({ where: { id: original.id }, data: { estado: 'ANULADA' } });
        return nc;
      }),
    );

    return { anulada: await this.obtener(sucursalId, id), notaCredito };
  }

  /**
   * Emite una **Nota de Débito** sobre un comprobante ya emitido.
   *
   * Es la contracara de `anular`, y las diferencias importan:
   *
   *  - **No anula nada.** El comprobante original sigue vigente y sin tocar;
   *    la nota se suma aparte.
   *  - **Monto propio.** No sale por el total del original: sale por lo que se
   *    está debitando (intereses, un flete, un ajuste de precio).
   *  - **No mueve stock.** No hay mercadería yendo ni viniendo; es plata.
   *  - **Suma a la cuenta corriente** si el original era fiado, porque el
   *    cliente ahora debe más.
   *
   * Lo que sí comparte con la NC: hereda la letra del original, viaja con
   * `CbtesAsoc` —ARCA la rechaza sin eso— y si ARCA no responde se registra
   * igual y el CAE se consigue después.
   */
  async emitirNotaDebito(sucursalId: string, id: string, dto: EmitirNotaDebitoDto) {
    const original = await this.obtener(sucursalId, id);
    if (!esComprobanteFiscal(original.tipoComprobante ?? 'TicketNoFiscal')) {
      throw new BadRequestException(
        'Un ticket no fiscal no admite Nota de Débito: no es un comprobante ante ARCA.',
      );
    }
    if (original.tipoComprobante?.startsWith('Nota')) {
      throw new BadRequestException('No se puede emitir una Nota de Débito sobre otra nota.');
    }
    // Debitarle algo a un comprobante anulado no tiene sentido: lo que se
    // estaría cobrando pertenece a una operación que se dio de baja.
    if (original.estado === 'ANULADA') {
      throw new BadRequestException(
        'No se puede emitir una Nota de Débito sobre un comprobante anulado.',
      );
    }
    const monto = new Decimal(dto.monto);
    if (monto.lte(0)) {
      throw new BadRequestException('El monto de la Nota de Débito debe ser mayor a cero.');
    }

    const tipoNd = notaDebitoDe(original.tipoComprobante);
    // El desglose se calcula sobre el monto de la NOTA, no sobre el del
    // original: son importes distintos. Sin ítems reales que consultar, se usa
    // la alícuota general — un débito por intereses o gastos va al 21%.
    const desgloseNd = desgloseDeMontoUnico(monto, tipoNd);
    const receptorNd = await this.desgloses.receptorDe(original.clienteId ?? null);
    const asociados = comprobanteAsociadoDe(original);
    const fiscal = await this.pedirCae(
      tipoNd,
      monto,
      sucursalId,
      desgloseNd,
      receptorNd,
      new Date(),
      asociados,
    );
    const cae = fiscal.cae;

    const notaDebito = await this.conNumeroUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const tipoFinal = cae?.tipoComprobante ?? tipoNd;
        const numeroComprobante =
          cae?.numeroComprobante ??
          (await this.siguienteNumeroNoFiscal(tx, sucursalId, tipoFinal));
        const nd = await tx.venta.create({
          data: {
            // A diferencia de la NC —una por venta— se pueden emitir VARIAS
            // notas de débito sobre el mismo comprobante (los intereses de un
            // mes, después los del siguiente), así que el sufijo tiene que ser
            // único. Se usa un UUID y no `Date.now()`: dos notas emitidas
            // dentro del mismo milisegundo chocaban contra el unique de
            // `operacionId`, y el test lo agarró.
            //
            // Acá el `operacionId` no da idempotencia como en la venta: la ND
            // entra por HTTP directo, no por la cola de sync, así que no hay
            // reintento automático que deduplicar. Lo que evita la nota doble
            // es el botón deshabilitado mientras se emite.
            operacionId: `${original.operacionId}-ND-${randomUUID()}`,
            estado: 'COMPLETADA',
            subtotal: monto,
            descuento: new Decimal(0),
            total: monto,
            medioPago: original.medioPago,
            cae: cae?.cae ?? null,
            caeFechaVto: cae?.caeFechaVto ?? null,
            estadoFiscal: fiscal.estadoFiscal,
            motivoFiscal: fiscal.motivo,
            numeroComprobante,
            tipoComprobante: tipoFinal,
            sucursalId,
            usuarioId: original.usuarioId,
            terminalId: original.terminalId,
            clienteId: original.clienteId ?? null,
            comprobanteAsociadoId: original.id,
            // Sin `productoId`: no hay mercadería. La línea existe para que el
            // comprobante tenga qué mostrar y para que el desglose cierre.
            conceptoLibre: dto.concepto,
            ...aDesglosePersistido(desgloseNd),
          },
          include: { items: true },
        });

        // Fiado: si el original fue a cuenta corriente, el débito también. El
        // cliente ahora debe más.
        if (original.medioPago === 'CUENTA_CORRIENTE' && original.clienteId) {
          await tx.movimientoCuentaCorriente.create({
            data: {
              tipo: 'CARGO',
              monto,
              concepto: `Nota de Débito: ${dto.concepto}`,
              clienteId: original.clienteId,
              sucursalId,
            },
          });
        }

        return nd;
      }),
    );

    return { original: await this.obtener(sucursalId, id), notaDebito };
  }

  /**
   * Pide el CAE, y **nunca deja que un problema de ARCA frene la venta**.
   *
   * La venta ya ocurrió: el cliente se llevó la mercadería y pagó. Que AFIP no
   * conteste no puede deshacer eso, y AFIP no contesta seguido. Por eso:
   *
   *  - ARCA autoriza      -> AUTORIZADA, con su CAE.
   *  - ARCA no responde   -> PENDIENTE. Se registra igual y el CAE se pide
   *                          después (`CaePendientesService`). Es la razón de
   *                          ser de todo esto.
   *  - ARCA la rechaza    -> RECHAZADA, con el motivo. Tampoco se deshace la
   *                          venta: se registra y queda marcada para corregir.
   *                          Reintentar no serviría.
   *  - No es fiscal       -> NO_APLICA (ticket interno, comercio sin alta).
   */
  private async pedirCae(
    tipoComprobante: string,
    total: Decimal,
    sucursalId: string,
    desglose: DesgloseIva,
    receptor: ReceptorArca,
    /**
     * Fecha del comprobante. Es la de la VENTA, no la de ahora: una venta
     * offline se autoriza cuando vuelve la conexión, y el `CbteFch` tiene que
     * ser el mismo que ya salió impreso en el ticket del cliente.
     */
    fecha: Date,
    /** Qué comprobante corrige, en una Nota de Crédito. ARCA lo exige. */
    comprobantesAsociados?: readonly ComprobanteAsociadoSolicitud[],
  ): Promise<{ cae: ResultadoCae | null; estadoFiscal: EstadoFiscal; motivo: string | null }> {
    if (!esComprobanteFiscal(tipoComprobante)) {
      return { cae: null, estadoFiscal: 'NO_APLICA', motivo: null };
    }
    // Una venta que estuvo offline más de la ventana de ARCA ya no se puede
    // autorizar con su fecha real, y mandarla es un rechazo seguro. Se registra
    // como pendiente con el motivo explicado, igual que hace el reintento.
    if (fueraDeVentanaArca(fecha, new Date())) {
      const motivo = motivoVentanaVencida(fecha, new Date());
      this.logger.warn(`Venta fuera de la ventana de ARCA: ${motivo}`);
      return { cae: null, estadoFiscal: 'PENDIENTE', motivo };
    }
    try {
      const cae = await this.cae.autorizar({
        tipoComprobante,
        total: total.toFixed(2),
        sucursalId,
        fecha,
        neto: desglose.neto.aDecimalString(2),
        iva: desglose.iva.aDecimalString(2),
        exento: desglose.exento.aDecimalString(2),
        renglonesIva: desglose.porAlicuota.map((r) => ({
          codigoArca: r.codigoArca,
          base: r.base.aDecimalString(2),
          importe: r.importe.aDecimalString(2),
        })),
        tipoDocReceptor: receptor.tipoDocReceptor,
        nroDocReceptor: receptor.nroDocReceptor,
        condicionIvaReceptor: receptor.condicionIvaReceptor,
        ...(codigoComprobanteArcaOpcional(tipoComprobante) !== null
          ? { codigoComprobante: codigoComprobanteArcaOpcional(tipoComprobante) as number }
          : {}),
        ...(comprobantesAsociados !== undefined && comprobantesAsociados.length > 0
          ? { comprobantesAsociados }
          : {}),
      });
      return { cae, estadoFiscal: 'AUTORIZADA', motivo: null };
    } catch (e) {
      if (e instanceof ErrorCaeNoDisponible) {
        this.logger.warn(`Venta registrada SIN CAE (se reintenta): ${e.message}`);
        return { cae: null, estadoFiscal: 'PENDIENTE', motivo: e.message };
      }
      if (e instanceof ErrorCaeRechazado) {
        this.logger.error(`ARCA rechazó el comprobante: ${e.message}`);
        return { cae: null, estadoFiscal: 'RECHAZADA', motivo: e.message };
      }
      throw e;
    }
  }

  async registrar(usuario: UsuarioCtx, dto: CrearVentaDto) {
    // Idempotencia (ADR-0005): si la operación ya se registró, la devolvemos.
    const existente = await this.prisma.venta.findUnique({
      where: { operacionId: dto.operacionId },
      include: { items: true },
    });
    if (existente) {
      this.logger.log(`Venta idempotente: ${dto.operacionId} ya existía`);
      return existente;
    }

    // Recalcular totales con Decimal (no confiamos en montos del cliente).
    let subtotal = new Decimal(0);
    const itemsData = dto.items.map((it) => {
      const cantidad = new Decimal(it.cantidad);
      const precioUnitario = new Decimal(it.precioUnitario);
      const descuento = new Decimal(it.descuento ?? '0');
      const subItem = cantidad.mul(precioUnitario).sub(descuento);
      subtotal = subtotal.add(subItem);
      return {
        cantidad,
        precioUnitario,
        descuento,
        subtotal: subItem,
        productoId: it.productoId,
        costoUnitario: it.costoUnitario !== undefined ? new Decimal(it.costoUnitario) : null,
      };
    });

    const descuentoGlobal = new Decimal(dto.descuento ?? '0');
    const recargoGlobal = new Decimal(dto.recargo ?? '0');
    const total = subtotal.sub(descuentoGlobal).add(recargoGlobal);
    const tipoComprobante = dto.tipoComprobante ?? 'FacturaB';
    // Cuándo ocurrió la venta, no cuándo llegó. Una venta offline puede entrar
    // horas después: con la hora del servidor caía en el turno de caja
    // equivocado y con un `CbteFch` distinto al del ticket (`fecha-de-venta.ts`).
    const fechaVenta = fechaDeVenta(dto.fecha, new Date());

    // Combos: resolvemos qué ítems son combos para descontar el stock de sus
    // componentes en vez del combo (ADR-0033).
    const componentesPorCombo = await this.componentesDeCombos(
      itemsData.map((it) => it.productoId),
    );
    // Movimientos de stock ya expandidos (combo→componentes) y con los lotes
    // asignados por FEFO para los perecederos (ADR-0034).
    const tramosStock = await this.planificarStockDeVenta(
      usuario.sucursalId,
      expandirStockDeVenta(itemsData, componentesPorCombo),
    );

    // Pago combinado: si viene el desglose, el medioPago resumen es el único
    // medio (si todos coinciden) o COMBINADO. Sin desglose, se usa dto.medioPago.
    const pagos = dto.pagos ?? [];
    const medioPagoResumen = resumenMedioPago(pagos, dto.medioPago);

    // Fiado (ADR-0037): la parte pagada con CUENTA_CORRIENTE va a la deuda del
    // cliente. Con desglose, se suma lo marcado CC; sin desglose, si el medio es
    // CC, va el total. La venta ya ocurrió: no se bloquea por límite de crédito.
    const montoCuentaCorriente =
      pagos.length > 0
        ? pagos
            .filter((p) => p.medioPago === 'CUENTA_CORRIENTE')
            .reduce((a, p) => a.add(new Decimal(p.monto)), new Decimal(0))
        : dto.medioPago === 'CUENTA_CORRIENTE'
          ? total
          : new Decimal(0);

    // Autorización fiscal. Nunca corta la venta: ver `pedirCae`.
    const desglose = await this.desgloses.deLineas(itemsData, tipoComprobante, total);
    const receptor = await this.desgloses.receptorDe(dto.clienteId ?? null);
    const fiscal = await this.pedirCae(
      tipoComprobante,
      total,
      usuario.sucursalId,
      desglose,
      receptor,
      fechaVenta,
    );
    const cae = fiscal.cae;

    // Transacción: venta + ítems + pagos + movimientos de stock VENTA (atómico).
    const venta = await this.conNumeroUnico(() =>
      this.prisma.$transaction(async (tx) => {
        const tipoFinal = cae?.tipoComprobante ?? tipoComprobante;
        const numeroComprobante =
          cae?.numeroComprobante ??
          (await this.siguienteNumeroNoFiscal(tx, usuario.sucursalId, tipoFinal));
        const v = await tx.venta.create({
          data: {
            operacionId: dto.operacionId,
            estado: 'COMPLETADA',
            creadaEn: fechaVenta,
            subtotal,
            descuento: descuentoGlobal,
            total,
            medioPago: medioPagoResumen,
            cae: cae?.cae ?? null,
            caeFechaVto: cae?.caeFechaVto ?? null,
            estadoFiscal: fiscal.estadoFiscal,
            motivoFiscal: fiscal.motivo,
            numeroComprobante,
            tipoComprobante: tipoFinal,
            sucursalId: usuario.sucursalId,
            usuarioId: usuario.id,
            terminalId: dto.terminalId ?? null,
            clienteId: dto.clienteId ?? null,
            // El desglose declarado a ARCA, congelado para la reimpresión: sin
            // esto una Factura A reimpresa sale sin discriminar IVA.
            ...aDesglosePersistido(desglose),
            items: { create: itemsData },
            ...(pagos.length > 0
              ? {
                  pagos: {
                    create: pagos.map((p) => ({
                      medioPago: p.medioPago,
                      monto: new Decimal(p.monto),
                      ...(p.tarjetaConfigId !== undefined
                        ? { tarjetaConfigId: p.tarjetaConfigId }
                        : {}),
                      ...(p.cuotas !== undefined ? { cuotas: p.cuotas } : {}),
                      ...(p.recargo !== undefined ? { recargo: new Decimal(p.recargo) } : {}),
                    })),
                  },
                }
              : {}),
          },
          include: {
            items: { include: { producto: { select: { id: true, nombre: true, codigo: true } } } },
            pagos: true,
          },
        });

        // La venta física ya ocurrió: registramos la salida de stock, sin
        // bloquear por stock insuficiente (control de negativo es informativo).
        // Combos ya expandidos y lotes ya asignados por FEFO (`tramosStock`).
        for (const t of tramosStock) {
          await tx.movimientoStock.create({
            data: {
              tipo: 'VENTA',
              cantidad: t.cantidad,
              motivo: `Venta ${dto.operacionId}`,
              productoId: t.productoId,
              sucursalId: usuario.sucursalId,
              ventaId: v.id,
              loteId: t.loteId,
            },
          });
        }

        // Fiado: cargamos la deuda a la cuenta corriente del cliente (sin chequear
        // el límite: la venta ya se hizo). El control de límite vive en el POS.
        if (montoCuentaCorriente.gt(0) && dto.clienteId) {
          await tx.movimientoCuentaCorriente.create({
            data: {
              tipo: 'CARGO',
              monto: montoCuentaCorriente,
              concepto: `Venta ${dto.operacionId}`,
              clienteId: dto.clienteId,
              sucursalId: usuario.sucursalId,
            },
          });
        }

        return v;
      }),
    );

    // Efectos posteriores: no deben tumbar una venta ya confirmada.
    await this.registrarEnLibro(venta, usuario.email);
    await this.respaldarSiCorresponde();

    return venta;
  }

  /**
   * Convierte los movimientos de stock de una venta (ya expandidos de combos) en
   * tramos concretos: para un producto simple, un tramo sin lote; para un
   * perecedero, los lotes asignados por FEFO más —si los lotes no alcanzan— un
   * tramo sin lote por el sobrante (la venta ya ocurrió, no se pierde la salida).
   */
  private async planificarStockDeVenta(
    sucursalId: string,
    movimientos: ReadonlyArray<{ productoId: string; cantidad: Decimal }>,
  ): Promise<TramoStock[]> {
    const ids = [...new Set(movimientos.map((m) => m.productoId))];
    const productos =
      ids.length > 0
        ? await this.prisma.producto.findMany({
            where: { id: { in: ids } },
            select: { id: true, requiereLote: true },
          })
        : [];
    const requiereLote = new Map(productos.map((p) => [p.id, p.requiereLote]));

    const tramos: TramoStock[] = [];
    for (const m of movimientos) {
      if (!requiereLote.get(m.productoId)) {
        tramos.push({ productoId: m.productoId, cantidad: m.cantidad, loteId: null });
        continue;
      }
      const lotes = await this.saldosDeLotes(sucursalId, m.productoId);
      const { asignaciones, restante } = asignarFefo(lotes, m.cantidad);
      for (const a of asignaciones) {
        tramos.push({ productoId: m.productoId, cantidad: a.cantidad, loteId: a.loteId });
      }
      if (restante.gt(0)) {
        tramos.push({ productoId: m.productoId, cantidad: restante, loteId: null });
      }
    }
    return tramos;
  }

  /** Saldo por lote de un producto (ENTRADA/AJUSTE suman, SALIDA/VENTA restan). */
  private async saldosDeLotes(sucursalId: string, productoId: string): Promise<LoteConSaldo[]> {
    const lotes = await this.prisma.lote.findMany({
      where: { productoId, sucursalId },
      select: { id: true, fechaVencimiento: true },
    });
    if (lotes.length === 0) return [];
    const movs = await this.prisma.movimientoStock.findMany({
      where: { productoId, sucursalId, loteId: { not: null } },
      select: { loteId: true, tipo: true, cantidad: true },
    });
    const saldo = new Map<string, Decimal>();
    for (const l of lotes) saldo.set(l.id, new Decimal(0));
    for (const mv of movs) {
      if (mv.loteId === null) continue;
      const cur = saldo.get(mv.loteId);
      if (cur === undefined) continue;
      saldo.set(
        mv.loteId,
        mv.tipo === 'ENTRADA' || mv.tipo === 'AJUSTE' ? cur.add(mv.cantidad) : cur.sub(mv.cantidad),
      );
    }
    return lotes.map((l) => ({
      loteId: l.id,
      saldo: saldo.get(l.id) ?? new Decimal(0),
      fechaVencimiento: l.fechaVencimiento,
    }));
  }

  /** Mapa `comboId → componentes` para los productos dados que sean combos. */
  private async componentesDeCombos(
    productoIds: readonly string[],
  ): Promise<Map<string, ComponenteCombo[]>> {
    const unicos = [...new Set(productoIds)];
    const filas = await this.prisma.comboComponente.findMany({
      where: { comboId: { in: unicos } },
    });
    const mapa = new Map<string, ComponenteCombo[]>();
    for (const f of filas) {
      const lista = mapa.get(f.comboId) ?? [];
      lista.push({ componenteId: f.componenteId, cantidad: f.cantidad });
      mapa.set(f.comboId, lista);
    }
    return mapa;
  }

  private async registrarEnLibro(
    // Sin `comprobanteAsociado` ni `cliente`: el libro no los usa, y pedirlos
    // obligaría a traer las relaciones en el `create` de la venta, que no las
    // tiene.
    venta: Omit<
      Awaited<ReturnType<VentasService['historial']>>[number],
      'comprobanteAsociado' | 'cliente'
    >,
    usuarioEmail: string,
  ): Promise<void> {
    try {
      await this.libro.registrar({
        fecha: venta.creadaEn,
        operacionId: venta.operacionId,
        comprobante: `${venta.tipoComprobante ?? ''} ${venta.numeroComprobante ?? ''}`.trim(),
        sucursalId: venta.sucursalId,
        usuario: usuarioEmail,
        medioPago: venta.medioPago,
        cantidadItems: venta.items.length,
        subtotal: venta.subtotal.toString(),
        descuento: venta.descuento.toString(),
        total: venta.total.toString(),
        cae: venta.cae ?? '',
      });
    } catch (error) {
      this.logger.error(`No se pudo actualizar el libro de ventas: ${(error as Error).message}`);
    }
  }

  /**
   * Próximo correlativo por (sucursal, tipo de comprobante) para comprobantes
   * SIN CAE (Fase 12.J): un `TicketNoFiscal` no tiene numeración fiscal, pero
   * igual necesita un número propio para identificarlo. Los comprobantes CON
   * CAE siguen numerándose vía `ServicioCae` (ver ADR-0008), sin tocar acá.
   */
  private async siguienteNumeroNoFiscal(
    tx: Tx,
    sucursalId: string,
    tipoComprobante: string,
  ): Promise<number> {
    const { _max } = await tx.venta.aggregate({
      where: { sucursalId, tipoComprobante },
      _max: { numeroComprobante: true },
    });
    return (_max.numeroComprobante ?? 0) + 1;
  }

  /**
   * `siguienteNumeroNoFiscal` calcula el número dentro de la misma transacción
   * que el `INSERT`, así que dos ventas concurrentes del mismo tipo podrían
   * calcular el mismo número antes de que la primera confirme. La restricción
   * `@@unique` de Prisma lo detecta (P2002); acá se reintenta la transacción
   * completa con el siguiente número disponible.
   */
  private async conNumeroUnico<T>(fn: () => Promise<T>): Promise<T> {
    const intentosMax = 3;
    for (let intento = 1; intento <= intentosMax; intento++) {
      try {
        return await fn();
      } catch (error) {
        const esColisionDeNumero =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!esColisionDeNumero || intento === intentosMax) throw error;
      }
    }
    // Inalcanzable: el for siempre retorna o lanza en su última iteración.
    throw new Error('No se pudo asignar el número de comprobante');
  }

  private async respaldarSiCorresponde(): Promise<void> {
    if (this.config.get<string>('RESPALDO_EN_CADA_VENTA') !== 'true') return;
    try {
      await this.motor.crearRespaldo();
    } catch (error) {
      this.logger.error(`Falló el respaldo post-venta: ${(error as Error).message}`);
    }
  }
}

/** Medio de pago resumen de una venta: el único medio, o COMBINADO, o el fallback. */
export function resumenMedioPago(
  pagos: ReadonlyArray<{ medioPago: MedioPago }>,
  fallback: MedioPago,
): MedioPago {
  if (pagos.length === 0) return fallback;
  const medios = new Set(pagos.map((p) => p.medioPago));
  return medios.size === 1 ? [...medios][0]! : MedioPago.COMBINADO;
}

/** Tipo de Nota de Crédito que corresponde a un comprobante (hereda la letra). */
export function notaCreditoDe(tipoComprobante: string | null): string {
  // Fase 10.1: un ticket sin valor fiscal no tiene Nota de Crédito — anular
  // refleja el mismo tipo (ver `esComprobanteFiscal`).
  if (tipoComprobante === 'TicketNoFiscal') return 'TicketNoFiscal';
  if (tipoComprobante?.startsWith('Factura')) {
    return tipoComprobante.replace('Factura', 'NotaCredito');
  }
  return 'NotaCreditoB';
}

/**
 * Tipo de Nota de Débito que corresponde a un comprobante (hereda la letra).
 *
 * A diferencia de `notaCreditoDe`, acá no hay caso `TicketNoFiscal`: un ticket
 * interno no admite Nota de Débito y el llamador lo rechaza antes.
 */
export function notaDebitoDe(tipoComprobante: string | null): string {
  if (tipoComprobante?.startsWith('Factura')) {
    return tipoComprobante.replace('Factura', 'NotaDebito');
  }
  return 'NotaDebitoB';
}

/**
 * Desglose de IVA de un importe suelto, sin ítems de los que sacar la alícuota.
 *
 * Lo necesita la Nota de Débito: se emite por intereses, un flete o un ajuste,
 * no por productos. Un débito de ese tipo va a la **alícuota general (21%)**,
 * que es el criterio habitual; si algún día hace falta elegirla, el concepto
 * tendría que venir con su tasa desde la UI.
 *
 * En un comprobante C no se discrimina, igual que en la venta.
 */
export function desgloseDeMontoUnico(monto: Decimal, tipoComprobante: string): DesgloseIva {
  const total = Money.desde(monto.toFixed(2));
  if (letraDe(tipoComprobante as TipoComprobante) === 'C') {
    return desgloseSinDiscriminar(total);
  }
  return desglosarIvaIncluido([{ importe: total, alicuota: ALICUOTAS_IVA.VEINTIUNO }]);
}

/** ¿El tipo de comprobante requiere CAE de ARCA? (Fase 10.1: TicketNoFiscal no.) */
export function esComprobanteFiscal(tipoComprobante: string): boolean {
  return tipoComprobante !== 'TicketNoFiscal';
}
