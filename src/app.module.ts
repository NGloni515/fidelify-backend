import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { validateEnv } from './config/env.validation.js';
import { CustomersModule } from './customers/customers.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { PassesModule } from './passes/passes.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicModule } from './public/public.module.js';
import { StaffModule } from './staff/staff.module.js';
import { WalletModule } from './wallet/wallet.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    AuthModule,
    CustomersModule,
    DashboardModule,
    PublicModule,
    PassesModule,
    StaffModule,
    WalletModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
