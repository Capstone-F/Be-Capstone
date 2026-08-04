import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SessionGuard } from '../auth/guards/session.guard';
import { StorageService } from './storage.service';
import { UploadsController } from './uploads.controller';

describe('UploadsController', () => {
  let controller: UploadsController;
  const storageService = {
    uploadImage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UploadsController],
      providers: [{ provide: StorageService, useValue: storageService }],
    })
      .overrideGuard(SessionGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(UploadsController);
  });

  it('uploads a valid image file', async () => {
    storageService.uploadImage.mockResolvedValue({
      url: 'https://cdn.example.com/images/a.jpg',
      key: 'images/a.jpg',
    });

    const file = {
      buffer: Buffer.from('img'),
      mimetype: 'image/jpeg',
      originalname: 'a.jpg',
    } as Express.Multer.File;

    await expect(controller.uploadImage(file)).resolves.toEqual({
      url: 'https://cdn.example.com/images/a.jpg',
      key: 'images/a.jpg',
    });
    expect(storageService.uploadImage).toHaveBeenCalledWith({
      buffer: file.buffer,
      contentType: 'image/jpeg',
      originalName: 'a.jpg',
    });
  });

  it('rejects unsupported mime types', async () => {
    const file = {
      buffer: Buffer.from('x'),
      mimetype: 'application/pdf',
      originalname: 'a.pdf',
    } as Express.Multer.File;

    await expect(controller.uploadImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storageService.uploadImage).not.toHaveBeenCalled();
  });

  it('accepts HEIC phone camera mime types', async () => {
    storageService.uploadImage.mockResolvedValue({
      url: 'https://cdn.example.com/images/a.heic',
      key: 'images/a.heic',
    });

    const file = {
      buffer: Buffer.from('img'),
      mimetype: 'image/heic',
      originalname: 'a.heic',
    } as Express.Multer.File;

    await expect(controller.uploadImage(file)).resolves.toEqual({
      url: 'https://cdn.example.com/images/a.heic',
      key: 'images/a.heic',
    });
    expect(storageService.uploadImage).toHaveBeenCalledWith({
      buffer: file.buffer,
      contentType: 'image/heic',
      originalName: 'a.heic',
    });
  });

  it('rejects empty file buffer', async () => {
    const file = {
      buffer: Buffer.alloc(0),
      mimetype: 'image/png',
      originalname: 'a.png',
    } as Express.Multer.File;

    await expect(controller.uploadImage(file)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
