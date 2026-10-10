import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { StaffRequest } from './staff-auth.guard.js';
import type { StaffSession } from './staff-session.js';

export const CurrentStaff = createParamDecorator(
  (_data: unknown, context: ExecutionContext): StaffSession => {
    const { staff } = context.switchToHttp().getRequest<StaffRequest>();
    if (!staff)
      throw new Error('CurrentStaff used on a route without StaffAuthGuard');
    return staff;
  },
);
