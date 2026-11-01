import type { Prisma } from '../generated/prisma/client.js';
import { DAY_MS } from './dashboard-rules.js';

export const PERIOD_DAYS = 30;
export const VISIT_TYPES: ('STAMP' | 'REDEEM')[] = ['STAMP', 'REDEEM'];

export function periodStart(now: Date): Date {
  return new Date(now.getTime() - PERIOD_DAYS * DAY_MS);
}

// Joined before the period and no stamp or redemption inside it: stopped
// coming, or never came back after joining. Inicio lists them and Mensajes
// writes to them, so both read it from here.
export function lapsedCustomerWhere(
  businessId: string,
  since: Date,
): Prisma.CustomerWhereInput {
  return {
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
  };
}
