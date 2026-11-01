import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppleWalletService } from './apple/apple-wallet.service.js';
import { GoogleWalletService } from './google/google-wallet.service.js';
import { WalletPassService } from './wallet-pass.service.js';
import type { WalletMessage, WalletPass } from './wallet-pass.js';

const TIMEOUT_MS = 4000;
const GOOGLE_PARALLEL = 10;

@Injectable()
export class WalletNotifierService {
  private readonly logger = new Logger(WalletNotifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passes: WalletPassService,
    private readonly google: GoogleWalletService,
    private readonly apple: AppleWalletService,
  ) {}

  // Awaited rather than fired in the background: a serverless host may freeze
  // the process as soon as the response is sent. Never throws and never outlasts
  // the timeout, because the stamp is already saved and the cashier is waiting.
  async passChanged(
    passId: string,
    change: { rewardEarned?: boolean } = {},
  ): Promise<void> {
    if (!this.google.configured && !this.apple.configured) return;
    const timeout = new Promise<void>((resolve) =>
      setTimeout(resolve, TIMEOUT_MS).unref(),
    );
    await Promise.race([this.notify(passId, change), timeout]);
  }

  // Unlike passChanged there is no overall timeout: the owner waits to see how
  // many cards the message reached. Returns the passes that took it in at
  // least one wallet. Never throws: the message is already saved.
  async broadcast(
    passIds: string[],
    message: WalletMessage,
  ): Promise<Set<string>> {
    const results = await Promise.allSettled([
      this.messageGoogle(passIds, message),
      this.pushApple(passIds),
    ]);
    const reached = new Set<string>();
    for (const result of results)
      if (result.status === 'fulfilled')
        for (const passId of result.value) reached.add(passId);
      else this.logger.error(`Wallet message failed: ${String(result.reason)}`);
    return reached;
  }

  private async notify(passId: string, change: { rewardEarned?: boolean }) {
    try {
      const pass = await this.passes.findById(passId);
      if (!pass) return;
      const results = await Promise.allSettled([
        this.notifyGoogle(pass, change.rewardEarned),
        this.pushApple([pass.id]),
      ]);
      for (const result of results)
        if (result.status === 'rejected')
          this.logger.error(`Wallet update failed: ${String(result.reason)}`);
    } catch (error) {
      this.logger.error(`Wallet update failed: ${String(error)}`);
    }
  }

  private async notifyGoogle(pass: WalletPass, rewardEarned?: boolean) {
    if (!this.google.configured) return;
    await this.google.syncBalance(
      pass,
      rewardEarned
        ? `¡Completaste tu tarjeta! Te espera ${pass.program.rewardText}.`
        : undefined,
    );
  }

  private async messageGoogle(passIds: string[], message: WalletMessage) {
    if (!this.google.configured) return [];
    const reached: string[] = [];
    for (let start = 0; start < passIds.length; start += GOOGLE_PARALLEL) {
      const batch = passIds.slice(start, start + GOOGLE_PARALLEL);
      const results = await Promise.allSettled(
        batch.map((passId) => this.google.addMessage(passId, message)),
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected')
          this.logger.error(
            `Google Wallet message failed: ${String(result.reason)}`,
          );
        else if (result.value) reached.push(batch[i]);
      });
    }
    return reached;
  }

  // Apple gets no content: the push makes each device fetch the pass again,
  // and the changeMessage of each field becomes the notification. A device
  // with several of these cards needs a single push. Returns the passes with
  // at least one device that took it.
  private async pushApple(passIds: string[]) {
    if (!this.apple.configured) return [];
    const registrations = await this.prisma.appleDeviceRegistration.findMany({
      where: { passId: { in: passIds } },
      select: { passId: true, pushToken: true },
    });
    const { delivered, gone } = await this.apple.notifyDevices([
      ...new Set(registrations.map(({ pushToken }) => pushToken)),
    ]);
    if (gone.length > 0)
      await this.prisma.appleDeviceRegistration.deleteMany({
        where: { passId: { in: passIds }, pushToken: { in: gone } },
      });
    const took = new Set(delivered);
    return registrations
      .filter(({ pushToken }) => took.has(pushToken))
      .map(({ passId }) => passId);
  }
}
