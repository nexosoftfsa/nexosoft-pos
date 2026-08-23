import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { CajaModule } from './caja/caja.module';
import { ClientesModule } from './clientes/clientes.module';
import { ProveedoresModule } from './proveedores/proveedores.module';
import { MediosPagoModule } from './medios-pago/medios-pago.module';
import { PresupuestosModule } from './presupuestos/presupuestos.module';
import { RemitosModule } from './remitos/remitos.module';
import { AsistenteModule } from './asistente/asistente.module';
import { ComercioModule } from './comercio/comercio.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { CredencialesModule } from './credenciales/credenciales.module';
import { LicenciaModule } from './licencia/licencia.module';
import { AccesoRemotoModule } from './acceso-remoto/acceso-remoto.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate-limiting global (Fase 15.B, prerrequisito de seguridad antes de
    // exponer admin-web/login a internet vía túnel -- ver ADR-0052). Límite
    // generoso acá; los endpoints de login tienen su propio límite más
    // estricto con @Throttle (ver auth.controller.ts).
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
    // Sirve el panel web (admin-web) estático desde el mismo servidor de sucursal.
    // Apuntar PANEL_RUTA al build (apps/admin-web/dist) o copiarlo a ./panel.
    // Se excluye /api para no pisar la API. Si la carpeta no existe, no sirve nada.
    ServeStaticModule.forRoot({
      rootPath: process.env['PANEL_RUTA'] ?? join(process.cwd(), 'panel'),
      exclude: ['/api/(.*)'],
    }),
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
    CajaModule,
    ClientesModule,
    ProveedoresModule,
    MediosPagoModule,
    PresupuestosModule,
    RemitosModule,
    AsistenteModule,
    ComercioModule,
    UsuariosModule,
    CredencialesModule,
    AccesoRemotoModule,
    LicenciaModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
