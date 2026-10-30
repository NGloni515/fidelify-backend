import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffSession } from '../auth/staff-session.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletNotifierService } from '../wallet/wallet-notifier.service.js';
import { applyAdjust, applyRedeem, applyStamp } from './stamp-rules.js';

class ConcurrentUpdateError extends Error {}

const MAX_ATTEMPTS = 3;

@Injectable()
export class PassesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletNotifierService,
  ) {}

  async findForCashier(serialNumber: string, staff: StaffSession) {
    const { id: _id, ...pass } = await this.findOwned(serialNumber, staff);
    return pass;
  }

  async stamp(serialNumber: string, staff: StaffSession, count = 1) {
    return this.withRetry(async () => {
      const pass = await this.findOwned(serialNumber, staff);
      const next = applyStamp(
        pass.balance,
        pass.rewardsReady,
        pass.program.stampsRequired,
        count,
      );
      await this.commit(
        pass,
        { balance: next.balance, rewardsReady: next.rewardsReady },
        { type: 'STAMP', amount: count },
        staff,
      );
      await this.wallet.passChanged(pass.id, {
        rewardEarned: next.rewardEarned,
      });
      return {
        serialNumber: pass.serialNumber,
        balance: next.balance,
        stampsRequired: pass.program.stampsRequired,
        rewardsReady: next.rewardsReady,
        rewardEarned: next.rewardEarned,
      };
    });
  }

  async redeem(serialNumber: string, staff: StaffSession) {
    return this.withRetry(async () => {
      const pass = await this.findOwned(serialNumber, staff);
      let next: { rewardsReady: number };
      try {
        next = applyRedeem(pass.rewardsReady);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      await this.commit(pass, next, { type: 'REDEEM', amount: -1 }, staff);
      await this.wallet.passChanged(pass.id);
      return {
        serialNumber: pass.serialNumber,
        balance: pass.balance,
        stampsRequired: pass.program.stampsRequired,
        rewardsReady: next.rewardsReady,
      };
    });
  }

  async adjust(
    serialNumber: string,
    staff: StaffSession,
    stamps: number,
    note: string,
  ) {
    return this.withRetry(async () => {
      const pass = await this.findOwned(serialNumber, staff);
      let next: ReturnType<typeof applyAdjust>;
      try {
        next = applyAdjust(
          pass.balance,
          pass.rewardsReady,
          pass.program.stampsRequired,
          stamps,
        );
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      await this.commit(
        pass,
        { balance: next.balance, rewardsReady: next.rewardsReady },
        { type: 'ADJUST', amount: stamps, note },
        staff,
      );
      await this.wallet.passChanged(pass.id, {
        rewardEarned: next.rewardEarned,
      });
      return {
        serialNumber: pass.serialNumber,
        balance: next.balance,
        stampsRequired: pass.program.stampsRequired,
        rewardsReady: next.rewardsReady,
        rewardEarned: next.rewardEarned,
      };
    });
  }

  private async findOwned(serialNumber: string, staff: StaffSession) {
    const pass = await this.prisma.pass.findFirst({
      where: {
        serialNumber,
        status: 'ACTIVE',
        program: { businessId: staff.business.id },
      },
      select: {
        id: true,
        serialNumber: true,
        balance: true,
        rewardsReady: true,
        customer: { select: { name: true, phone: true } },
        program: {
          select: { name: true, stampsRequired: true, rewardText: true },
        },
      },
    });
    if (!pass) throw new NotFoundException('Tarjeta no encontrada');
    return pass;
  }

  // Optimistic lock: the write only lands if the balance is still the one read.
  private async commit(
    pass: { id: string; balance: number; rewardsReady: number },
    data: { balance?: number; rewardsReady: number },
    movement: {
      type: 'STAMP' | 'REDEEM' | 'ADJUST';
      amount: number;
      note?: string;
    },
    staff: StaffSession,
  ) {
    await this.prisma.$transaction(async (db) => {
      const { count } = await db.pass.updateMany({
        where: {
          id: pass.id,
          balance: pass.balance,
          rewardsReady: pass.rewardsReady,
        },
        data,
      });
      if (count === 0) throw new ConcurrentUpdateError();
      await db.transaction.create({
        data: {
          passId: pass.id,
          staffId: staff.id,
          branchId: staff.branchId,
          ...movement,
        },
      });
    });
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof ConcurrentUpdateError)) throw e;
        if (attempt >= MAX_ATTEMPTS)
          throw new ConflictException(
            'Alguien más está atendiendo esta tarjeta. Vuelve a intentarlo.',
          );
      }
    }
  }
}
