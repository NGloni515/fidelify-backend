import { Injectable } from '@nestjs/common';
import { connect } from 'node:http2';

const APNS_HOST = 'https://api.push.apple.com';

export interface ApnsCredentials {
  cert: string;
  key: string;
  passphrase?: string;
}

export interface ApnsResult {
  pushToken: string;
  status: number;
}

@Injectable()
export class ApnsClient {
  // A Wallet push carries no content: it only tells the device to ask for the pass again.
  async push(
    credentials: ApnsCredentials,
    topic: string,
    pushTokens: string[],
  ): Promise<ApnsResult[]> {
    if (pushTokens.length === 0) return [];
    const session = connect(APNS_HOST, credentials);
    try {
      return await Promise.all(
        pushTokens.map(
          (pushToken) =>
            new Promise<ApnsResult>((resolve, reject) => {
              const request = session.request({
                ':method': 'POST',
                ':path': `/3/device/${pushToken}`,
                'apns-topic': topic,
              });
              request.on('response', (headers) =>
                resolve({ pushToken, status: Number(headers[':status']) }),
              );
              request.on('error', reject);
              request.end('{}');
            }),
        ),
      );
    } finally {
      session.close();
    }
  }
}
