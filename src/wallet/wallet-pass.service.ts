import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseBrandColors, type WalletPass } from './wallet-pass.js';

const SELECT = {
  id: true,
  serialNumber: true,
  authToken: true,
  balance: true,
  rewardsReady: true,
  status: true,
  updatedAt: true,
  customer: { select: { name: true } },
  program: {
    select: {
      id: true,
      name: true,
      stampsRequired: true,
      rewardText: true,
      business: { select: { name: true, logoUrl: true, colors: true } },
    },
  },
} satisfies Prisma.PassSelect;

@Injectable()
export class WalletPassService {
  constructor(private readonly prisma: PrismaService) {}

  findBySerial(serialNumber: string): Promise<WalletPass> {
    return this.require({ serialNumber, status: 'ACTIVE' });
  }

  // Voided too: a card already saved in a wallet has to learn it was voided.
  findIssuedBySerial(serialNumber: string): Promise<WalletPass> {
    return this.require({ serialNumber });
  }

  findById(id: string): Promise<WalletPass | null> {
    return this.find({ id });
  }

  private async require(where: Prisma.PassWhereInput): Promise<WalletPass> {
    const pass = await this.find(where);
    if (!pass) throw new NotFoundException('Tarjeta no encontrada');
    return pass;
  }

  private async find(where: Prisma.PassWhereInput): Promise<WalletPass | null> {
    const pass = await this.prisma.pass.findFirst({
      where: { ...where, program: { business: { active: true } } },
      select: SELECT,
    });
    if (!pass) return null;
    const { business, ...program } = pass.program;
    return {
      id: pass.id,
      serialNumber: pass.serialNumber,
      authToken: pass.authToken,
      balance: pass.balance,
      rewardsReady: pass.rewardsReady,
      updatedAt: pass.updatedAt,
      voided: pass.status === 'VOIDED',
      customerName: pass.customer?.name ?? null,
      program,
      business: {
        name: business.name,
        logoUrl: business.logoUrl,
        colors: parseBrandColors(business.colors),
      },
    };
  }
}
