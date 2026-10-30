import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator.js';
import { OwnerGuard } from '../auth/owner.guard.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import type { StaffSession } from '../auth/staff-session.js';
import { CustomersService } from './customers.service.js';
import { SearchCustomersDto } from './dto/search-customers.dto.js';

@Controller('customers')
@UseGuards(StaffAuthGuard, OwnerGuard)
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  // POST so a phone number typed in the search never ends up in a URL, where
  // proxies and request logs would keep it.
  @Post('search')
  @HttpCode(200)
  search(@Body() dto: SearchCustomersDto, @CurrentStaff() staff: StaffSession) {
    return this.service.search(staff, dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentStaff() staff: StaffSession) {
    return this.service.findOne(staff, id);
  }
}
