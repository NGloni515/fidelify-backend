import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PKPass } from 'passkit-generator';
import { readSecret } from '../secrets.js';
import type { WalletPass } from '../wallet-pass.js';
import { ApnsClient } from './apns-client.js';
import {
  buildApplePassFields,
  buildApplePassProps,
  type ApplePassIdentity,
} from './apple-pass.js';
import { DEFAULT_ICON } from './default-icon.js';

const LOGO_TIMEOUT_MS = 3000;
// APNs answers 410 when the device no longer has the pass.
const APNS_UNREGISTERED = 410;

interface AppleConfig {
  identity: ApplePassIdentity;
  certificates: {
    wwdr: string;
    signerCert: string;
    signerKey: string;
    signerKeyPassphrase?: string;
  };
}

@Injectable()
export class AppleWalletService {
  private readonly logger = new Logger(AppleWalletService.name);
  private readonly appleConfig?: AppleConfig;

  constructor(
    config: ConfigService,
    private readonly apns: ApnsClient,
  ) {
    const passTypeIdentifier = config.get<string>('APPLE_PASS_TYPE_ID')?.trim();
    const teamIdentifier = config.get<string>('APPLE_TEAM_ID')?.trim();
    const signerCert = readSecret(config.get<string>('APPLE_PASS_CERT'));
    const signerKey = readSecret(config.get<string>('APPLE_PASS_KEY'));
    const wwdr = readSecret(config.get<string>('APPLE_WWDR_CERT'));
    if (
      !passTypeIdentifier ||
      !teamIdentifier ||
      !signerCert ||
      !signerKey ||
      !wwdr
    )
      return;

    const apiUrl = config.get<string>('PUBLIC_API_URL')?.replace(/\/+$/, '');
    this.appleConfig = {
      identity: {
        passTypeIdentifier,
        teamIdentifier,
        // Apple only calls a web service over HTTPS.
        webServiceURL: apiUrl?.startsWith('https://')
          ? `${apiUrl}/api/wallet/apple/`
          : undefined,
      },
      certificates: {
        wwdr,
        signerCert,
        signerKey,
        signerKeyPassphrase:
          config.get<string>('APPLE_PASS_KEY_PASSPHRASE') || undefined,
      },
    };
  }

  get configured(): boolean {
    return Boolean(this.appleConfig);
  }

  get passTypeIdentifier(): string | undefined {
    return this.appleConfig?.identity.passTypeIdentifier;
  }

  async buildPass(pass: WalletPass): Promise<Buffer> {
    const { identity, certificates } = this.requireConfig();
    const logo = await this.fetchLogo(pass.business.logoUrl);
    const pkpass = new PKPass(
      {
        ...DEFAULT_ICON,
        ...(logo && { 'logo.png': logo, 'logo@2x.png': logo }),
      },
      certificates,
      buildApplePassProps(identity, pass),
    );
    pkpass.type = 'storeCard';

    const fields = buildApplePassFields(pass);
    pkpass.headerFields.push(...fields.headerFields);
    pkpass.primaryFields.push(...fields.primaryFields);
    pkpass.secondaryFields.push(...fields.secondaryFields);
    pkpass.backFields.push(...fields.backFields);
    pkpass.setBarcodes(fields.barcode);
    return pkpass.getAsBuffer();
  }

  // Returns the push tokens Apple reported as gone, so the caller can forget them.
  async notifyDevices(pushTokens: string[]): Promise<string[]> {
    const { identity, certificates } = this.requireConfig();
    const results = await this.apns.push(
      {
        cert: certificates.signerCert,
        key: certificates.signerKey,
        passphrase: certificates.signerKeyPassphrase,
      },
      identity.passTypeIdentifier,
      pushTokens,
    );
    for (const { status } of results)
      if (status !== 200 && status !== APNS_UNREGISTERED)
        this.logger.warn(`APNs answered ${status}`);
    return results
      .filter(({ status }) => status === APNS_UNREGISTERED)
      .map(({ pushToken }) => pushToken);
  }

  // A broken or slow logo must not stop the customer from getting the card.
  private async fetchLogo(logoUrl: string | null): Promise<Buffer | null> {
    if (!logoUrl) return null;
    try {
      const res = await fetch(logoUrl, {
        signal: AbortSignal.timeout(LOGO_TIMEOUT_MS),
      });
      const isPng = res.headers.get('content-type')?.includes('image/png');
      if (!res.ok || !isPng) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }

  private requireConfig(): AppleConfig {
    if (!this.appleConfig) throw new Error('Apple Wallet is not configured');
    return this.appleConfig;
  }
}
