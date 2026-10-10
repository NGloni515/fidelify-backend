import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { readSecret } from '../secrets.js';
import type { WalletPass } from '../wallet-pass.js';
import {
  buildGoogleBalance,
  buildGoogleClass,
  buildGoogleObject,
  googleObjectId,
} from './google-pass.js';

const SAVE_URL = 'https://pay.google.com/gp/v/save';
const API_URL = 'https://walletobjects.googleapis.com/walletobjects/v1';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

interface ServiceAccount {
  client_email: string;
  private_key: string;
}

@Injectable()
export class GoogleWalletService {
  private readonly logger = new Logger(GoogleWalletService.name);
  private readonly issuerId?: string;
  private readonly account?: ServiceAccount;
  private accessToken?: { value: string; expiresAt: number };

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.issuerId = config.get<string>('GOOGLE_WALLET_ISSUER_ID')?.trim();
    const account = readSecret(
      config.get<string>('GOOGLE_WALLET_SERVICE_ACCOUNT'),
    );
    if (account) this.account = JSON.parse(account) as ServiceAccount;
  }

  get configured(): boolean {
    return Boolean(this.issuerId && this.account);
  }

  // The class and the object travel inside the link: Google creates them when
  // the customer saves the card, so nothing is created for links nobody opens.
  async saveUrl(pass: WalletPass): Promise<string> {
    const { issuerId, account } = this.requireConfig();
    const token = await this.jwt.signAsync(
      {
        iss: account.client_email,
        aud: 'google',
        typ: 'savetowallet',
        origins: [],
        payload: {
          genericClasses: [buildGoogleClass(issuerId, pass)],
          genericObjects: [buildGoogleObject(issuerId, pass)],
        },
      },
      { privateKey: account.private_key, algorithm: 'RS256' },
    );
    return `${SAVE_URL}/${token}`;
  }

  async syncBalance(pass: WalletPass, announcement?: string): Promise<void> {
    const { issuerId } = this.requireConfig();
    const objectUrl = `${API_URL}/genericobject/${googleObjectId(issuerId, pass.id)}`;

    const patched = await this.call(
      'PATCH',
      objectUrl,
      buildGoogleBalance(pass),
    );
    // 404: the customer never saved the card to Google Wallet.
    if (patched.status === 404) return;
    if (!patched.ok)
      throw new Error(`Google Wallet PATCH failed with ${patched.status}`);

    if (!announcement) return;
    const announced = await this.call('POST', `${objectUrl}/addMessage`, {
      message: {
        id: `reward-${pass.updatedAt.getTime()}`,
        header: pass.business.name,
        body: announcement,
        messageType: 'TEXT_AND_NOTIFY',
      },
    });
    if (!announced.ok)
      this.logger.warn(
        `Google Wallet addMessage failed with ${announced.status}`,
      );
  }

  private async call(method: string, url: string, body: unknown) {
    return fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }

  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.accessToken.expiresAt > Date.now())
      return this.accessToken.value;

    const { account } = this.requireConfig();
    const assertion = await this.jwt.signAsync(
      { iss: account.client_email, scope: SCOPE, aud: TOKEN_URL },
      { privateKey: account.private_key, algorithm: 'RS256', expiresIn: 3600 },
    );
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) throw new Error(`Google OAuth failed with ${res.status}`);
    const token = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = {
      value: token.access_token,
      // Renew a minute early so a token never expires mid-request.
      expiresAt: Date.now() + (token.expires_in - 60) * 1000,
    };
    return this.accessToken.value;
  }

  private requireConfig() {
    if (!this.issuerId || !this.account)
      throw new Error('Google Wallet is not configured');
    return { issuerId: this.issuerId, account: this.account };
  }
}
