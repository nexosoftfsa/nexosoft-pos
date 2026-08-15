import { Module } from '@nestjs/common';
import { ComercioController } from './comercio.controller';
import { ComercioService } from './comercio.service';

@Module({
  controllers: [ComercioController],
  providers: [ComercioService],
})
export class ComercioModule {}
