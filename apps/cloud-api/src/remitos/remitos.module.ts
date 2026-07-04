import { Module } from '@nestjs/common';
import { RemitosService } from './remitos.service';
import { RemitosController } from './remitos.controller';

@Module({
  providers: [RemitosService],
  controllers: [RemitosController],
  exports: [RemitosService],
})
export class RemitosModule {}
