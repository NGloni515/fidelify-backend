import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ApnsClient } from './apple/apns-client.js';
import { AppleWalletService } from './apple/apple-wallet.service.js';
import { AppleWebServiceController } from './apple/apple-web-service.controller.js';
import { GoogleWalletService } from './google/google-wallet.service.js';
import { WalletNotifierService } from './wallet-notifier.service.js';
import { WalletPassService } from './wallet-pass.service.js';
import { WalletController } from './wallet.controller.js';

@Module({
  imports: [JwtModule.register({})],
  controllers: [WalletController, AppleWebServiceController],
  providers: [
    WalletPassService,
    GoogleWalletService,
    AppleWalletService,
    ApnsClient,
    WalletNotifierService,
  ],
  exports: [WalletNotifierService],
})
export class WalletModule {}
