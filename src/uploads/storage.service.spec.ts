import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppConfigService } from '../config/config.service';
import { StorageService } from './storage.service';

const sendMock = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: sendMock,
    })),
    PutObjectCommand: jest.fn().mockImplementation((input) => input),
  };
});

describe('StorageService', () => {
  let service: StorageService;
  let config: {
    r2AccountId: string;
    r2AccessKeyId: string;
    r2SecretAccessKey: string;
    r2Bucket: string;
    r2PublicBaseUrl: string;
  };

  beforeEach(async () => {
    sendMock.mockReset();
    config = {
      r2AccountId: 'acct',
      r2AccessKeyId: 'key',
      r2SecretAccessKey: 'secret',
      r2Bucket: 'bucket',
      r2PublicBaseUrl: 'https://cdn.example.com',
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StorageService,
        { provide: AppConfigService, useValue: config },
      ],
    }).compile();

    service = module.get(StorageService);
  });

  it('reports configured when all R2 env vars are set', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('throws 503 when R2 is not configured', async () => {
    config.r2AccountId = '';
    await expect(
      service.uploadImage({
        buffer: Buffer.from('x'),
        contentType: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('uploads image and returns public url + key', async () => {
    sendMock.mockResolvedValue({});

    const result = await service.uploadImage({
      buffer: Buffer.from('img'),
      contentType: 'image/png',
      originalName: 'photo.png',
    });

    expect(sendMock).toHaveBeenCalled();
    expect(result.key).toMatch(/^images\/\d{4}\/\d{2}\/[a-f0-9-]+\.png$/);
    expect(result.url).toBe(`https://cdn.example.com/${result.key}`);
  });

  it('uses .heic extension for image/heic content type', async () => {
    sendMock.mockResolvedValue({});

    const result = await service.uploadImage({
      buffer: Buffer.from('img'),
      contentType: 'image/heic',
      originalName: 'photo.heic',
    });

    expect(result.key).toMatch(/^images\/\d{4}\/\d{2}\/[a-f0-9-]+\.heic$/);
  });
});
