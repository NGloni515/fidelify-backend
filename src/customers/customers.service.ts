import { Injectable, NotFoundException } from '@nestjs/common';
import type { StaffSession } from '../auth/staff-session.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SearchCustomersDto } from './dto/search-customers.dto.js';

export const PAGE_SIZE = 50;
const HISTORY_LIMIT = 100;
const VISIT_TYPES = ['STAMP', 'REDEEM'] as const;

const LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  createdAt: true,
  passes: {
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: {
      serialNumber: true,
      balance: true,
      rewardsReady: true,
      program: { select: { stampsRequired: true } },
      transactions: {
        where: { type: { in: [...VISIT_TYPES] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  },
} satisfies Prisma.CustomerSelect;

const DETAIL_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  birthDate: true,
  createdAt: true,
  consentAt: true,
  passes: {
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: {
      serialNumber: true,
      balance: true,
      rewardsReady: true,
      program: {
        select: { name: true, stampsRequired: true, rewardText: true },
      },
      transactions: {
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: {
          type: true,
          amount: true,
          note: true,
          createdAt: true,
          staff: { select: { name: true } },
        },
      },
    },
  },
} satisfies Prisma.CustomerSelect;

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async search(staff: StaffSession, dto: SearchCustomersDto) {
    const page = dto.page ?? 1;
    const where = this.searchWhere(staff, dto.query);
    const [total, customers] = await this.prisma.$transaction([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);
    return {
      total,
      page,
      pageSize: PAGE_SIZE,
      customers: customers.map(({ createdAt, passes, ...customer }) => ({
        ...customer,
        joinedAt: createdAt,
        lastVisitAt: latest(
          passes.map((pass) => pass.transactions[0]?.createdAt),
        ),
        passes: passes.map((pass) => ({
          serialNumber: pass.serialNumber,
          balance: pass.balance,
          rewardsReady: pass.rewardsReady,
          stampsRequired: pass.program.stampsRequired,
        })),
      })),
    };
  }

  async findOne(staff: StaffSession, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId: staff.business.id },
      select: DETAIL_SELECT,
    });
    if (!customer) throw new NotFoundException('Cliente no encontrado');
    const { createdAt, birthDate, passes, ...rest } = customer;
    return {
      ...rest,
      // A calendar date: sent as YYYY-MM-DD so no timezone can move it a day.
      birthDate: birthDate?.toISOString().slice(0, 10) ?? null,
      joinedAt: createdAt,
      passes: passes.map(({ transactions, ...pass }) => ({
        ...pass,
        movements: transactions.map(({ staff: by, createdAt: at, ...m }) => ({
          ...m,
          at,
          staffName: by?.name ?? null,
        })),
      })),
    };
  }

  private searchWhere(
    staff: StaffSession,
    query: string | undefined,
  ): Prisma.CustomerWhereInput {
    const where: Prisma.CustomerWhereInput = { businessId: staff.business.id };
    if (!query) return where;
    const digits = query.replace(/\D/g, '');
    where.OR = [
      { name: { contains: query, mode: 'insensitive' } },
      {
        passes: {
          some: { serialNumber: { contains: query.toUpperCase() } },
        },
      },
      ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
    ];
    return where;
  }
}

function latest(dates: (Date | undefined)[]): Date | null {
  return dates.reduce<Date | null>(
    (max, date) => (date && (!max || date > max) ? date : max),
    null,
  );
}
