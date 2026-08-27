import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { VentasService } from './ventas.service';
import { VentasController } from './ventas.controller';
import { RespaldoModule } from '../respaldo/respaldo.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { SERVICIO_CAE } from './cae/servicio-cae';
import { ServicioCaeMock } from './cae/servicio-cae-mock';
import { ServicioCaeArca } from './cae/servicio-cae-arca';
import { ServicioCaeSelector } from './cae/servicio-cae-selector';
import { CaePendientesService } from './cae/cae-pendientes.service';
import { DesgloseDeVentaService } from './cae/desglose-de-venta.service';
import { LIBRO_DE_VENTAS, type LibroDeVentas } from './libro/libro-de-ventas';
import { LibroDeVentasExcel } from './libro/libro-de-ventas-excel';

@Module({
  imports: [
    RespaldoModule, // aporta MotorDeRespaldo (respaldo en cada venta)
    FiscalModule, // datos fiscales del comercio + certificado de ARCA
  ],
  controllers: [VentasController],
  providers: [
    VentasService,
    CaePendientesService,
    DesgloseDeVentaService,
    ServicioCaeArca,
    ServicioCaeMock,
    {
      // El selector decide en cada venta: ARCA de verdad si el comercio está
      // dado de alta, mock (ticket no fiscal) si todavía no.
      provide: SERVICIO_CAE,
      useClass: ServicioCaeSelector,
    },
    {
      // El Excel vive junto a los respaldos, así viaja a la nube propia del cliente.
      provide: LIBRO_DE_VENTAS,
      useFactory: (config: ConfigService): LibroDeVentas => {
        const carpeta = config.get<string>('RESPALDO_RUTA') ?? './respaldos';
        const ruta =
          config.get<string>('LIBRO_VENTAS_ARCHIVO') ?? join(carpeta, 'ventas.xlsx');
        return new LibroDeVentasExcel(ruta);
      },
      inject: [ConfigService],
    },
  ],
  exports: [VentasService, CaePendientesService],
})
export class VentasModule {}
