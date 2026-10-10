import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { newAuthToken, newSerialNumber } from '../common/serial.js';
import { JoinDto } from './join.dto.js';

export const CONSENT_TEXT =
  'Acepto que el negocio guarde mi nombre y datos de contacto para administrar mi tarjeta de fidelidad y enviarme promociones. Puedo pedir que se eliminen en cualquier momento.';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  /** Datos que la página pública necesita para mostrar el programa. */
  async getProgramBySlug(slug: string) {
    const business = await this.prisma.business.findFirst({
      where: { slug, active: true },
      select: {
        name: true,
        slug: true,
        logoUrl: true,
        colors: true,
        programs: {
          where: { active: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: {
            id: true,
            name: true,
            type: true,
            stampsRequired: true,
            rewardText: true,
          },
        },
      },
    });
    const program = business?.programs[0];
    if (!business || !program)
      throw new NotFoundException('Negocio no encontrado');
    const { programs: _programs, ...rest } = business;
    return { business: rest, program, consentText: CONSENT_TEXT };
  }

  /**
   * Inscribe al cliente (o lo reconoce por su teléfono) y le crea su pase.
   * Si ya estaba inscrito, devuelve el pase existente en lugar de duplicarlo.
   */
  async join(slug: string, dto: JoinDto) {
    const { program } = await this.getProgramBySlug(slug);
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.upsert({
        where: {
          businessId_phone: { businessId: business.id, phone: dto.phone },
        },
        update: { name: dto.name, email: dto.email ?? undefined },
        create: {
          businessId: business.id,
          name: dto.name,
          phone: dto.phone,
          email: dto.email,
          birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
          consentAt: new Date(),
          consentText: CONSENT_TEXT,
        },
      });

      const pass = await tx.pass.upsert({
        where: {
          programId_customerId: {
            programId: program.id,
            customerId: customer.id,
          },
        },
        update: {},
        create: {
          programId: program.id,
          customerId: customer.id,
          serialNumber: newSerialNumber(),
          authToken: newAuthToken(),
        },
        select: { serialNumber: true, balance: true },
      });

      return {
        serialNumber: pass.serialNumber,
        balance: pass.balance,
        stampsRequired: program.stampsRequired,
        // Links para agregar el pase. Se implementan en el módulo wallet.
        appleWalletUrl: `/api/wallet/apple/${pass.serialNumber}`,
        googleWalletUrl: `/api/wallet/google/${pass.serialNumber}`,
      };
    });
  }
}
