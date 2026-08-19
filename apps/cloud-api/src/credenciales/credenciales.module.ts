import { Module } from '@nestjs/common';
import { CredencialesController } from './credenciales.controller';
import { CredencialesService } from './credenciales.service';

@Module({
  controllers: [CredencialesController],
  providers: [CredencialesService],
  exports: [CredencialesService],
})
export class CredencialesModule {}
