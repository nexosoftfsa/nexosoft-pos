import { Module } from '@nestjs/common';
import { CertificadoController } from './certificado.controller';
import { CertificadoService } from './certificado.service';
import { ConfiguracionFiscalService } from './configuracion-fiscal.service';
import { ConfiguracionFiscalController } from './configuracion-fiscal.controller';
import { DiagnosticoArcaService } from './diagnostico-arca.service';

@Module({
  controllers: [CertificadoController, ConfiguracionFiscalController],
  providers: [CertificadoService, ConfiguracionFiscalService, DiagnosticoArcaService],
  exports: [CertificadoService, ConfiguracionFiscalService],
})
export class FiscalModule {}
