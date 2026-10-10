import { Module } from '@nestjs/common';
import { PassesController } from './passes.controller.js';
import { PassesService } from './passes.service.js';

@Module({
  controllers: [PassesController],
  providers: [PassesService],
  exports: [PassesService],
})
export class PassesModule {}
