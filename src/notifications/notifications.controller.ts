import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentStaff } from '../auth/current-staff.decorator.js';
import { OwnerGuard } from '../auth/owner.guard.js';
import { StaffAuthGuard } from '../auth/staff-auth.guard.js';
import type { StaffSession } from '../auth/staff-session.js';
import { SendNotificationDto } from './dto/send-notification.dto.js';
import { NotificationsService } from './notifications.service.js';

@Controller('notifications')
@UseGuards(StaffAuthGuard, OwnerGuard)
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  overview(@CurrentStaff() staff: StaffSession) {
    return this.service.overview(staff);
  }

  @Post()
  send(@Body() dto: SendNotificationDto, @CurrentStaff() staff: StaffSession) {
    return this.service.send(staff, dto);
  }
}
