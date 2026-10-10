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

  async findBySerial(serialNumber: string): Promise<WalletPass> {
    const pass = await this.find({ serialNumber });
    if (!pass) throw new NotFoundException('Tarjeta no encontrada');
    return pass;
  }

  findById(id: string): Promise<WalletPass | null> {
    return this.find({ id });
  }

  private async find(where: Prisma.PassWhereInput): Promise<WalletPass | null> {
    const pass = await this.prisma.pass.findFirst({
      where: {
        ...where,
        status: 'ACTIVE',
        program: { business: { active: true } },
      },
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
      customerName: pass.customer.name,
      program,
      business: {
        name: business.name,
        logoUrl: business.logoUrl,
        colors: parseBrandColors(business.colors),
      },
    };
  }
}
