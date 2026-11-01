import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { StaffSession } from '../auth/staff-session.js';
import {
  lapsedCustomerWhere,
  periodStart,
} from '../dashboard/lapsed-customers.js';
import { Prisma } from '../generated/prisma/client.js';
import { NotificationAudience } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletNotifierService } from '../wallet/wallet-notifier.service.js';
import { SendNotificationDto } from './dto/send-notification.dto.js';
import {
  MAX_MESSAGE_LENGTH,
  nextSendAt,
  PER_DAY,
  PER_WEEK,
  waitText,
  WEEK_MS,
} from './notification-rules.js';

const HISTORY_LIMIT = 20;
const MAX_ATTEMPTS = 3;

const SELECT = {
  id: true,
  message: true,
  audience: true,
  audienceSize: true,
  reached: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

const toItem = ({
  createdAt,
  ...notification
}: Prisma.NotificationGetPayload<{ select: typeof SELECT }>) => ({
  ...notification,
  sentAt: createdAt,
});

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletNotifierService,
  ) {}

  async overview(staff: StaffSession, now = new Date()) {
    const businessId = staff.business.id;
    const [sent, history, audiences] = await Promise.all([
      this.recentSends(this.prisma, businessId, now),
      this.prisma.notification.findMany({
        where: { businessId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_LIMIT,
        select: SELECT,
      }),
      Promise.all(
        Object.values(NotificationAudience).map(async (audience) => ({
          audience,
          size: await this.prisma.customer.count({
            where: {
              businessId,
              passes: {
                some: await this.passesWhere(
                  this.prisma,
                  businessId,
                  audience,
                  now,
                ),
              },
            },
          }),
        })),
      ),
    ]);
    return {
      maxLength: MAX_MESSAGE_LENGTH,
      limits: { perDay: PER_DAY, perWeek: PER_WEEK },
      nextAvailableAt: nextSendAt(sent, now),
      audiences,
      history: history.map(toItem),
    };
  }

  async send(staff: StaffSession, dto: SendNotificationDto) {
    const { notification, passes } = await this.reserve(staff.business.id, dto);
    const took = await this.wallet.broadcast(
      passes.map(({ id }) => id),
      {
        id: `message-${notification.id}`,
        header: staff.business.name,
        body: notification.message,
      },
    );
    const reached = new Set(
      passes
        .filter(({ id }) => took.has(id))
        .map(({ customerId }) => customerId),
    ).size;
    return toItem(
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { reached },
        select: SELECT,
      }),
    );
  }

  // Serializable, so two sends at once cannot both get under the limit:
  // Postgres aborts one, and its retry sees the other's message. A stamp
  // landing on one of the cards meanwhile aborts it too, and the retry goes on.
  // The clock is read on every attempt and saved as is, so the wait it reports
  // is measured against the same clock.
  private async reserve(
    businessId: string,
    { message, audience }: SendNotificationDto,
  ) {
    for (let attempt = 1; ; attempt++) {
      const now = new Date();
      try {
        return await this.prisma.$transaction(
          async (db) => {
            const next = nextSendAt(
              await this.recentSends(db, businessId, now),
              now,
            );
            if (next)
              throw new HttpException(
                `Ya llegaste al límite de mensajes. Puedes enviar el próximo en ${waitText(next.getTime() - now.getTime())}.`,
                HttpStatus.TOO_MANY_REQUESTS,
              );
            const passes = await db.pass.findMany({
              where: await this.passesWhere(db, businessId, audience, now),
              select: { id: true, customerId: true },
            });
            if (passes.length === 0)
              throw new BadRequestException('No hay clientes en ese grupo.');
            const notification = await db.notification.create({
              data: {
                businessId,
                message,
                audience,
                audienceSize: new Set(passes.map((p) => p.customerId)).size,
                createdAt: now,
              },
              select: SELECT,
            });
            await db.pass.updateMany({
              where: { id: { in: passes.map(({ id }) => id) } },
              data: { lastMessage: message },
            });
            return { notification, passes };
          },
          { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
        );
      } catch (error) {
        const conflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2034';
        if (!conflict) throw error;
        if (attempt >= MAX_ATTEMPTS)
          throw new ConflictException(
            'No se pudo enviar el mensaje. Vuelve a intentarlo.',
          );
      }
    }
  }

  private async recentSends(
    db: Prisma.TransactionClient,
    businessId: string,
    now: Date,
  ) {
    const sent = await db.notification.findMany({
      where: {
        businessId,
        createdAt: { gt: new Date(now.getTime() - WEEK_MS) },
      },
      select: { createdAt: true },
    });
    return sent.map(({ createdAt }) => createdAt);
  }

  // Only active cards: a voided one has no customer left to write to.
  private async passesWhere(
    db: Prisma.TransactionClient,
    businessId: string,
    audience: NotificationAudience,
    now: Date,
  ): Promise<Prisma.PassWhereInput> {
    const active: Prisma.PassWhereInput = {
      status: 'ACTIVE',
      program: { businessId },
    };
    switch (audience) {
      case 'ALL':
        return active;
      case 'LAPSED':
        return {
          ...active,
          customer: lapsedCustomerWhere(businessId, periodStart(now)),
        };
      case 'ONE_STAMP_LEFT': {
        const programs = await db.program.findMany({
          where: { businessId },
          select: { id: true, stampsRequired: true },
        });
        return {
          ...active,
          OR: programs.map(({ id, stampsRequired }) => ({
            programId: id,
            balance: stampsRequired - 1,
          })),
        };
      }
    }
  }
}
