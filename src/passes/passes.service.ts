import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { applyRedeem, applyStamp } from './stamp-rules.js';

class ConcurrentUpdateError extends Error {}

@Injectable()
export class PassesService {
  constructor(private readonly prisma: PrismaService) {}

  async findBySerial(serialNumber: string) {
    const pass = await this.prisma.pass.findUnique({
      where: { serialNumber },
      include: {
        customer: { select: { name: true, phone: true } },
        program: {
          select: {
            name: true,
            stampsRequired: true,
            rewardText: true,
            businessId: true,
          },
        },
      },
    });
    if (!pass || pass.status !== 'ACTIVE')
      throw new NotFoundException('Tarjeta no encontrada');
    return pass;
  }

  /** La cajera escanea el QR y suma sellos. */
  async stamp(serialNumber: string, count = 1, staffId?: string) {
    return this.withRetry(async () => {
      const pass = await this.findBySerial(serialNumber);
      const next = applyStamp(
        pass.balance,
        pass.rewardsReady,
        pass.program.stampsRequired,
        count,
      );
      await this.commit(
        pass,
        { balance: next.balance, rewardsReady: next.rewardsReady },
        { type: 'STAMP', amount: count, staffId },
      );
      // TODO: avisar a Apple/Google Wallet para que el pase se actualice en el celular.
      return {
        serialNumber,
        balance: next.balance,
        stampsRequired: pass.program.stampsRequired,
        rewardsReady: next.rewardsReady,
        rewardEarned: next.rewardEarned,
      };
    });
  }

  /** Canjea un premio ganado. */
  async redeem(serialNumber: string, staffId?: string) {
    return this.withRetry(async () => {
      const pass = await this.findBySerial(serialNumber);
      let next: { rewardsReady: number };
      try {
        next = applyRedeem(pass.rewardsReady);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
      await this.commit(pass, next, {
        type: 'REDEEM',
        amount: -1,
        staffId,
      });
      return {
        serialNumber,
        balance: pass.balance,
        stampsRequired: pass.program.stampsRequired,
        rewardsReady: next.rewardsReady,
      };
    });
  }

  /**
   * Guarda el nuevo saldo solo si nadie lo cambió desde que lo leímos
   * (bloqueo optimista). Así dos escaneos simultáneos no se pisan.
   */
  private async commit(
    pass: { id: string; balance: number; rewardsReady: number },
    data: { balance?: number; rewardsReady: number },
    tx: { type: 'STAMP' | 'REDEEM'; amount: number; staffId?: string },
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
      await db.transaction.create({ data: { passId: pass.id, ...tx } });
    });
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    for (let i = 1; ; i++) {
      try {
        return await fn();
      } catch (e) {
        if (!(e instanceof ConcurrentUpdateError) || i >= attempts) throw e;
      }
    }
  }
}
