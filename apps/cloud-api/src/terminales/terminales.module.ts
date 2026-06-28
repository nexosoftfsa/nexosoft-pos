import { Module } from '@nestjs/common';
import { TerminalesService } from './terminales.service';
import { TerminalesController } from './terminales.controller';

@Module({
  providers: [TerminalesService],
  controllers: [TerminalesController],
  exports: [TerminalesService],
})
export class TerminalesModule {}
