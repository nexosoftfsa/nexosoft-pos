import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { HealthModule } from './health/health.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { StockModule } from './stock/stock.module';
import { TerminalesModule } from './terminales/terminales.module';
import { RespaldoModule } from './respaldo/respaldo.module';
import { VentasModule } from './ventas/ventas.module';
import { SyncModule } from './sync/sync.module';
import { ReportesModule } from './reportes/reportes.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CatalogoModule,
    StockModule,
    TerminalesModule,
    RespaldoModule,
    VentasModule,
    SyncModule,
    ReportesModule,
  ],
})
export class AppModule {}
