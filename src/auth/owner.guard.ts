import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { StaffRequest } from './staff-auth.guard.js';

// Goes after StaffAuthGuard, which is the one that loads request.staff.
@Injectable()
export class OwnerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { staff } = context.switchToHttp().getRequest<StaffRequest>();
    if (staff?.role !== 'OWNER')
      throw new ForbiddenException(
        'Solo el dueño del negocio puede hacer esto',
      );
    return true;
  }
}
