import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { RedisClientType } from 'redis';
import { AppConfigService } from '../config/config.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export type MobileAuthCodePayload = {
  userId: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
  expiresIn: number;
  roles: string[];
  isNewUser: boolean;
  idpHint: string;
};

@Injectable()
export class MobileAuthCodeService {
  private readonly keyPrefix = 'oauth:mobile-code:';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly config: AppConfigService,
  ) {}

  async issue(payload: MobileAuthCodePayload): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(`${this.keyPrefix}${code}`, JSON.stringify(payload), {
      EX: this.config.mobileAuthCodeTtlSeconds,
    });
    return code;
  }

  /**
   * Atomically get + delete the one-time code (single-use).
   * Returns null when missing, expired, or already consumed.
   */
  async consume(code: string): Promise<MobileAuthCodePayload | null> {
    if (!code?.trim()) {
      return null;
    }

    const key = `${this.keyPrefix}${code}`;
    const raw = await this.redis.getDel(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MobileAuthCodePayload;
    } catch {
      return null;
    }
  }
}
