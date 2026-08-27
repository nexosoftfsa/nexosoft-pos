import { Module } from '@nestjs/common';
import { CertificadoController } from './certificado.controller';
import { CertificadoService } from './certificado.service';
import { ConfiguracionFiscalService } from './configuracion-fiscal.service';
import { ConfiguracionFiscalController } from './configuracion-fiscal.controller';

@Module({
  controllers: [CertificadoController, ConfiguracionFiscalController],
  providers: [CertificadoService, ConfiguracionFiscalService],
  exports: [CertificadoService, ConfiguracionFiscalService],
})
export class FiscalModule {}
