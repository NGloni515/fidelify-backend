import {
  Controller,
  Get,
  NotImplementedException,
  Param,
  Redirect,
  StreamableFile,
} from '@nestjs/common';
import { AppleWalletService } from './apple/apple-wallet.service.js';
import { GoogleWalletService } from './google/google-wallet.service.js';
import { WalletPassService } from './wallet-pass.service.js';

export const PKPASS_TYPE = 'application/vnd.apple.pkpass';

// Opened by the customer's browser as plain links: no headers, no session.
// The serial in the URL is the only thing that identifies the card.
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly passes: WalletPassService,
    private readonly apple: AppleWalletService,
    private readonly google: GoogleWalletService,
  ) {}

  @Get('apple/:serial')
  async applePass(@Param('serial') serial: string) {
    if (!this.apple.configured)
      throw new NotImplementedException(
        'Apple Wallet todavía no está configurado',
      );
    const pass = await this.passes.findBySerial(serial);
    return new StreamableFile(await this.apple.buildPass(pass), {
      type: PKPASS_TYPE,
      disposition: 'attachment; filename="tarjeta.pkpass"',
    });
  }

  @Get('google/:serial')
  @Redirect()
  async googlePass(@Param('serial') serial: string) {
    if (!this.google.configured)
      throw new NotImplementedException(
        'Google Wallet todavía no está configurado',
      );
    const pass = await this.passes.findBySerial(serial);
    return { url: await this.google.saveUrl(pass), statusCode: 302 };
  }
}
