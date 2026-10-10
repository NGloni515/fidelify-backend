import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { PassesService } from './passes.service.js';

class StampDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  count?: number;
}

/**
 * Endpoints de la pantalla de caja.
 * TODO: proteger con autenticación de StaffUser (JWT) y validar que el pase
 * pertenezca al negocio del cajero antes de exponerlo en producción.
 */
@Controller('passes')
export class PassesController {
  constructor(private readonly service: PassesService) {}

  @Get(':serial')
  find(@Param('serial') serial: string) {
    return this.service.findBySerial(serial);
  }

  @Post(':serial/stamp')
  stamp(@Param('serial') serial: string, @Body() dto: StampDto) {
    return this.service.stamp(serial, dto.count ?? 1);
  }

  @Post(':serial/redeem')
  redeem(@Param('serial') serial: string) {
    return this.service.redeem(serial);
  }
}
