import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { hashPassword } from '../auth/password.js';
import type { StaffSession } from '../auth/staff-session.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateStaffDto } from './dto/create-staff.dto.js';
import type { UpdateStaffDto } from './dto/update-staff.dto.js';

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
} satisfies Prisma.StaffUserSelect;

const EMAIL_TAKEN = 'Ya existe un usuario con ese correo';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  list(staff: StaffSession) {
    return this.prisma.staffUser.findMany({
      where: { businessId: staff.business.id },
      select: STAFF_SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createCashier(staff: StaffSession, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    if (await this.prisma.staffUser.findUnique({ where: { email } }))
      throw new ConflictException(EMAIL_TAKEN);

    const branchId =
      staff.branchId ??
      (
        await this.prisma.branch.findFirst({
          where: { businessId: staff.business.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    try {
      return await this.prisma.staffUser.create({
        data: {
          businessId: staff.business.id,
          branchId,
          name: dto.name,
          email,
          role: 'CASHIER',
          passwordHash: await hashPassword(dto.password),
        },
        select: STAFF_SELECT,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(EMAIL_TAKEN);
      throw error;
    }
  }

  async updateCashier(staff: StaffSession, id: string, dto: UpdateStaffDto) {
    if (dto.active === undefined && dto.password === undefined)
      throw new BadRequestException('No hay nada que cambiar');

    const target = await this.prisma.staffUser.findFirst({
      where: { id, businessId: staff.business.id },
      select: { id: true, role: true },
    });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    // Covers the owner's own account too: locking themselves out would leave
    // the business with nobody who can manage the team.
    if (target.role !== 'CASHIER')
      throw new ForbiddenException(
        'Desde Equipo solo se cambian las cuentas de las cajeras',
      );

    return this.prisma.staffUser.update({
      where: { id: target.id },
      data: {
        active: dto.active,
        passwordHash:
          dto.password === undefined
            ? undefined
            : await hashPassword(dto.password),
      },
      select: STAFF_SELECT,
    });
  }
}
