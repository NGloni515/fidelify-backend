import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator.js';
import { OwnerGuard } from '../auth/owner.guard.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import type { StaffSession } from '../auth/staff-session.js';
import { CreateStaffDto } from './dto/create-staff.dto.js';
import { UpdateStaffDto } from './dto/update-staff.dto.js';
import { StaffService } from './staff.service.js';

@Controller('staff')
@UseGuards(StaffAuthGuard, OwnerGuard)
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  list(@CurrentStaff() staff: StaffSession) {
    return this.service.list(staff);
  }

  @Post()
  create(@Body() dto: CreateStaffDto, @CurrentStaff() staff: StaffSession) {
    return this.service.createCashier(staff, dto);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
    @CurrentStaff() staff: StaffSession,
  ) {
    return this.service.updateCashier(staff, id, dto);
  }
}
