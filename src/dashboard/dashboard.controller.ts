import { Controller, Get, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator.js';
import { OwnerGuard } from '../auth/owner.guard.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import type { StaffSession } from '../auth/staff-session.js';
import { DashboardService } from './dashboard.service.js';

@Controller('dashboard')
@UseGuards(StaffAuthGuard, OwnerGuard)
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get()
  summary(@CurrentStaff() staff: StaffSession) {
    return this.service.summary(staff);
  }
}
