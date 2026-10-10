import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import type { StaffSession } from '../auth/staff-session.js';
import { StampDto } from './dto/stamp.dto.js';
import { PassesService } from './passes.service.js';

@Controller('passes')
@UseGuards(StaffAuthGuard)
export class PassesController {
  constructor(private readonly service: PassesService) {}

  @Get(':serial')
  find(@Param('serial') serial: string, @CurrentStaff() staff: StaffSession) {
    return this.service.findForCashier(serial, staff);
  }

  @Post(':serial/stamp')
  stamp(
    @Param('serial') serial: string,
    @Body() dto: StampDto,
    @CurrentStaff() staff: StaffSession,
  ) {
    return this.service.stamp(serial, staff, dto?.count ?? 1);
  }

  @Post(':serial/redeem')
  redeem(@Param('serial') serial: string, @CurrentStaff() staff: StaffSession) {
    return this.service.redeem(serial, staff);
  }
}
