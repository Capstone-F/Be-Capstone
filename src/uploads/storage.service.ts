import {
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppConfigService } from '../config/config.service';

export type UploadedImage = {
  url: string;
  key: string;
};

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

@Injectable()
export class StorageService {
  private client: S3Client | null = null;

  constructor(private readonly config: AppConfigService) {}

  isConfigured(): boolean {
    return Boolean(
      this.config.r2AccountId &&
      this.config.r2AccessKeyId &&
      this.config.r2SecretAccessKey &&
      this.config.r2Bucket &&
      this.config.r2PublicBaseUrl,
    );
  }

  async uploadImage(params: {
    buffer: Buffer;
    contentType: string;
    originalName?: string;
  }): Promise<UploadedImage> {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Object storage (R2) is not configured',
      );
    }

    const ext =
      EXT_BY_MIME[params.contentType] ??
      this.extensionFromName(params.originalName) ??
      'bin';
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    const key = `images/${yyyy}/${mm}/${randomUUID()}.${ext}`;

    const input: PutObjectCommandInput = {
      Bucket: this.config.r2Bucket,
      Key: key,
      Body: params.buffer,
      ContentType: params.contentType,
    };

    await this.getClient().send(new PutObjectCommand(input));

    const base = this.config.r2PublicBaseUrl.replace(/\/+$/, '');
    return { url: `${base}/${key}`, key };
  }

  private getClient(): S3Client {
    if (this.client) {
      return this.client;
    }
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${this.config.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.config.r2AccessKeyId,
        secretAccessKey: this.config.r2SecretAccessKey,
      },
    });
    return this.client;
  }

  private extensionFromName(name?: string): string | null {
    if (!name) return null;
    const match = /\.([a-zA-Z0-9]+)$/.exec(name);
    return match ? match[1].toLowerCase() : null;
  }
}
