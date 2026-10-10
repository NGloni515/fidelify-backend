import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppleWalletService } from './apple/apple-wallet.service.js';
import { GoogleWalletService } from './google/google-wallet.service.js';
import { WalletPassService } from './wallet-pass.service.js';
import type { WalletPass } from './wallet-pass.js';

const TIMEOUT_MS = 4000;

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

  private async notify(passId: string, change: { rewardEarned?: boolean }) {
    try {
      const pass = await this.passes.findById(passId);
      if (!pass) return;
      const results = await Promise.allSettled([
        this.notifyGoogle(pass, change.rewardEarned),
        this.notifyApple(pass),
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

  // Apple gets no content: the push makes each device fetch the pass again,
  // and the changeMessage of each field becomes the notification.
  private async notifyApple(pass: WalletPass) {
    if (!this.apple.configured) return;
    const registrations = await this.prisma.appleDeviceRegistration.findMany({
      where: { passId: pass.id },
      select: { pushToken: true },
    });
    const gone = await this.apple.notifyDevices(
      registrations.map(({ pushToken }) => pushToken),
    );
    if (gone.length > 0)
      await this.prisma.appleDeviceRegistration.deleteMany({
        where: { passId: pass.id, pushToken: { in: gone } },
      });
  }
}
