import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  NotFoundException,
  NotImplementedException,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service.js';
import { WalletPassService } from '../wallet-pass.service.js';
import type { WalletPass } from '../wallet-pass.js';
import { PKPASS_TYPE } from '../wallet.controller.js';
import { AppleWalletService } from './apple-wallet.service.js';

// The web service Apple Wallet calls on its own; paths and status codes are
// dictated by Apple, not by this API's conventions.
// https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
@Controller('wallet/apple/v1')
export class AppleWebServiceController {
  private readonly logger = new Logger(AppleWebServiceController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passes: WalletPassService,
    private readonly apple: AppleWalletService,
  ) {}

  @Post('devices/:deviceId/registrations/:passTypeId/:serial')
  async register(
    @Param('deviceId') deviceLibraryId: string,
    @Param('passTypeId') passTypeIdentifier: string,
    @Param('serial') serial: string,
    @Headers('authorization') authorization: string | undefined,
    @Body('pushToken') pushToken: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pass = await this.authorize(
      passTypeIdentifier,
      serial,
      authorization,
    );
    const key = {
      deviceLibraryId_passTypeIdentifier_passId: {
        deviceLibraryId,
        passTypeIdentifier,
        passId: pass.id,
      },
    };
    const existing = await this.prisma.appleDeviceRegistration.findUnique({
      where: key,
    });
    await this.prisma.$transaction([
      this.prisma.appleDeviceRegistration.upsert({
        where: key,
        update: { pushToken },
        create: {
          deviceLibraryId,
          passTypeIdentifier,
          passId: pass.id,
          pushToken,
        },
      }),
      this.prisma.pass.update({
        where: { id: pass.id },
        data: { platform: 'APPLE' },
      }),
    ]);
    res.status(existing ? 200 : 201);
  }

  @Get('devices/:deviceId/registrations/:passTypeId')
  async listUpdated(
    @Param('deviceId') deviceLibraryId: string,
    @Param('passTypeId') passTypeIdentifier: string,
    @Query('passesUpdatedSince') since: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.requirePassType(passTypeIdentifier);
    const sinceMs = Number(since);
    const passes = await this.prisma.pass.findMany({
      where: {
        status: 'ACTIVE',
        appleRegistrations: { some: { deviceLibraryId, passTypeIdentifier } },
        ...(since &&
          Number.isFinite(sinceMs) && { updatedAt: { gt: new Date(sinceMs) } }),
      },
      select: { serialNumber: true, updatedAt: true },
    });
    if (passes.length === 0) {
      res.status(204);
      return;
    }
    const lastUpdated = Math.max(...passes.map((p) => p.updatedAt.getTime()));
    return {
      serialNumbers: passes.map((p) => p.serialNumber),
      lastUpdated: String(lastUpdated),
    };
  }

  @Get('passes/:passTypeId/:serial')
  async latest(
    @Param('passTypeId') passTypeIdentifier: string,
    @Param('serial') serial: string,
    @Headers('authorization') authorization: string | undefined,
    @Headers('if-modified-since') ifModifiedSince: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const pass = await this.authorize(
      passTypeIdentifier,
      serial,
      authorization,
    );
    // HTTP dates have second precision; compare at that precision.
    const updatedAt = Math.floor(pass.updatedAt.getTime() / 1000) * 1000;
    if (ifModifiedSince && updatedAt <= Date.parse(ifModifiedSince)) {
      res.status(304);
      return;
    }
    res.setHeader('Last-Modified', new Date(updatedAt).toUTCString());
    return new StreamableFile(await this.apple.buildPass(pass), {
      type: PKPASS_TYPE,
    });
  }

  @Delete('devices/:deviceId/registrations/:passTypeId/:serial')
  async unregister(
    @Param('deviceId') deviceLibraryId: string,
    @Param('passTypeId') passTypeIdentifier: string,
    @Param('serial') serial: string,
    @Headers('authorization') authorization: string | undefined,
  ) {
    const pass = await this.authorize(
      passTypeIdentifier,
      serial,
      authorization,
    );
    await this.prisma.appleDeviceRegistration.deleteMany({
      where: { deviceLibraryId, passTypeIdentifier, passId: pass.id },
    });
  }

  @Post('log')
  @HttpCode(200)
  log(@Body('logs') logs: unknown) {
    this.logger.warn(`Apple Wallet: ${JSON.stringify(logs)}`);
  }

  private requirePassType(passTypeIdentifier: string) {
    if (!this.apple.configured)
      throw new NotImplementedException(
        'Apple Wallet todavía no está configurado',
      );
    if (passTypeIdentifier !== this.apple.passTypeIdentifier)
      throw new NotFoundException();
  }

  private async authorize(
    passTypeIdentifier: string,
    serial: string,
    authorization: string | undefined,
  ): Promise<WalletPass> {
    this.requirePassType(passTypeIdentifier);
    const pass = await this.passes.findBySerial(serial);
    const expected = Buffer.from(`ApplePass ${pass.authToken}`);
    const received = Buffer.from(authorization ?? '');
    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    )
      throw new UnauthorizedException();
    return pass;
  }
}
