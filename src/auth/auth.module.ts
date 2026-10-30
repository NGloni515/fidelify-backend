import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { OwnerGuard } from './owner.guard.js';
import { StaffAuthGuard } from './staff-auth.guard.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, StaffAuthGuard, OwnerGuard],
  exports: [AuthService, StaffAuthGuard, OwnerGuard],
})
export class AuthModule {}
