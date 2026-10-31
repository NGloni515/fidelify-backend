import { Injectable } from '@nestjs/common';
import type { StaffSession } from '../auth/staff-session.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DAY_MS, startOfDay, topVisitors } from './dashboard-rules.js';

// Every business is in Ecuador and Business has no time zone of its own yet.
const TIME_ZONE = 'America/Guayaquil';
const PERIOD_DAYS = 30;
const TOP_LIMIT = 5;
const LAPSED_LIMIT = 10;
const VISIT_TYPES: ('STAMP' | 'REDEEM')[] = ['STAMP', 'REDEEM'];

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(staff: StaffSession, now = new Date()) {
    const businessId = staff.business.id;
    const today = startOfDay(now, TIME_ZONE);
    const since = new Date(now.getTime() - PERIOD_DAYS * DAY_MS);
    const ofBusiness = {
      pass: { program: { businessId } },
    } satisfies Prisma.TransactionWhereInput;

    const [
      customers,
      newCustomers,
      stampsToday,
      redeemedToday,
      stampsInPeriod,
      redeemedInPeriod,
      pending,
      visits,
      lapsed,
    ] = await Promise.all([
      this.prisma.customer.count({ where: { businessId } }),
      this.prisma.customer.count({
        where: { businessId, createdAt: { gte: since } },
      }),
      this.sumStamps({ ...ofBusiness, createdAt: { gte: today } }),
      this.prisma.transaction.count({
        where: { ...ofBusiness, type: 'REDEEM', createdAt: { gte: today } },
      }),
      this.sumStamps({ ...ofBusiness, createdAt: { gte: since } }),
      this.prisma.transaction.count({
        where: { ...ofBusiness, type: 'REDEEM', createdAt: { gte: since } },
      }),
      this.prisma.pass.aggregate({
        where: { status: 'ACTIVE', program: { businessId } },
        _sum: { rewardsReady: true },
      }),
      this.prisma.transaction.findMany({
        where: {
          type: { in: VISIT_TYPES },
          createdAt: { gte: since },
          pass: { status: 'ACTIVE', program: { businessId } },
        },
        select: {
          createdAt: true,
          pass: { select: { customer: { select: { id: true, name: true } } } },
        },
      }),
      this.lapsedCustomers(businessId, since),
    ]);

    return {
      periodDays: PERIOD_DAYS,
      customers: {
        total: customers,
        newInPeriod: newCustomers,
        lapsed: lapsed.length,
      },
      today: { stamps: stampsToday, rewardsRedeemed: redeemedToday },
      period: { stamps: stampsInPeriod, rewardsRedeemed: redeemedInPeriod },
      rewardsPending: pending._sum.rewardsReady ?? 0,
      topCustomers: topVisitors(
        visits.map((v) => ({
          customerId: v.pass.customer.id,
          name: v.pass.customer.name,
          at: v.createdAt,
        })),
        TIME_ZONE,
        TOP_LIMIT,
      ),
      lapsedCustomers: lapsed.slice(0, LAPSED_LIMIT),
    };
  }

  private async sumStamps(where: Prisma.TransactionWhereInput) {
    const { _sum } = await this.prisma.transaction.aggregate({
      where: { ...where, type: 'STAMP' },
      _sum: { amount: true },
    });
    return _sum.amount ?? 0;
  }

  // Joined before the period and no stamp or redemption inside it. Sorted by
  // when they were last seen, most recent first: the ones that just stopped
  // coming are the easiest to win back.
  private async lapsedCustomers(businessId: string, since: Date) {
    const customers = await this.prisma.customer.findMany({
      where: {
        businessId,
        createdAt: { lt: since },
        passes: {
          none: {
            status: 'ACTIVE',
            transactions: {
              some: { type: { in: VISIT_TYPES }, createdAt: { gte: since } },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        createdAt: true,
        passes: {
          where: { status: 'ACTIVE' },
          select: {
            transactions: {
              where: { type: { in: VISIT_TYPES } },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
      },
    });
    return customers
      .map(({ id, name, createdAt, passes }) => {
        const lastVisitAt =
          passes
            .map((pass) => pass.transactions[0]?.createdAt)
            .filter((at): at is Date => at !== undefined)
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
        return { id, name, joinedAt: createdAt, lastVisitAt };
      })
      .sort(
        (a, b) =>
          (b.lastVisitAt ?? b.joinedAt).getTime() -
          (a.lastVisitAt ?? a.joinedAt).getTime(),
      );
  }
}
