import { Inject, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { RedisClientType } from 'redis';
import { AppConfigService } from '../config/config.service';
import { REDIS_CLIENT } from '../redis/redis.constants';

export type MobileOauthStatePayload = {
  clientRedirectUri: string;
  idpHint?: string;
  flow: 'mobile';
  createdAt: number;
};

@Injectable()
export class MobileOauthStateService {
  private readonly keyPrefix = 'oauth:state:';

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly config: AppConfigService,
  ) {}

  async create(clientRedirectUri: string, idpHint?: string): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    const payload: MobileOauthStatePayload = {
      clientRedirectUri,
      idpHint,
      flow: 'mobile',
      createdAt: Date.now(),
    };

    await this.redis.set(`${this.keyPrefix}${state}`, JSON.stringify(payload), {
      EX: this.config.mobileOauthStateTtlSeconds,
    });

    return state;
  }

  /**
   * Atomically get + delete the state entry (single-use).
   * Returns null when missing, expired, or already consumed.
   */
  async consume(state: string): Promise<MobileOauthStatePayload | null> {
    if (!state?.trim()) {
      return null;
    }

    const key = `${this.keyPrefix}${state}`;
    const raw = await this.redis.getDel(key);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as MobileOauthStatePayload;
    } catch {
      return null;
    }
  }
}
