import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AppConfigService } from '../../config/config.service';
import { ConsultationRequest } from '../../consultations/consultation-request.entity';
import { User } from '../../users/user.entity';
import * as zegoAssistant from './zego-server-assistant';
import { ZegoTokenService } from './zego-token.service';

describe('ZegoTokenService', () => {
  const bookingId = '9f21a000-0000-4000-8000-000000000001';
  const customerUserId = 'u-customer';
  const expertUserId = 'u-expert';

  let consultationRepo: { findOne: jest.Mock };
  let userRepo: { findOne: jest.Mock; find: jest.Mock };
  let config: {
    zegoAppId: string;
    zegoServerSecret: string;
  };
  let service: ZegoTokenService;
  let generateToken04Spy: jest.SpyInstance;

  beforeEach(() => {
    consultationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: bookingId,
        customerId: 'cust-1',
        expertId: 'expert-1',
        customer: { userId: customerUserId },
        expert: { userId: expertUserId },
      }),
    };
    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: customerUserId,
        name: 'Nguyen Van A',
      }),
      find: jest.fn().mockResolvedValue([
        { id: customerUserId, name: 'Nguyen Van A' },
        { id: expertUserId, name: 'Dr. Tran B' },
      ]),
    };
    config = {
      zegoAppId: '123456',
      zegoServerSecret: 'abcdefghijklmnopqrstuvwxyz123456',
    };
    service = new ZegoTokenService(
      consultationRepo as unknown as Repository<ConsultationRequest>,
      userRepo as unknown as Repository<User>,
      config as unknown as AppConfigService,
    );
    generateToken04Spy = jest
      .spyOn(zegoAssistant, 'generateToken04')
      .mockReturnValue('04AAAA_test_token');
  });

  afterEach(() => {
    generateToken04Spy.mockRestore();
  });

  describe('generateVideoToken', () => {
    it('returns a token scoped to consult_{bookingId} for the customer', async () => {
      const result = await service.generateVideoToken(
        customerUserId,
        bookingId,
      );

      expect(result).toEqual({
        appID: 123456,
        token: '04AAAA_test_token',
        roomID: `consult_${bookingId}`,
        userID: customerUserId,
        userName: 'Nguyen Van A',
      });

      const payload = JSON.parse(generateToken04Spy.mock.calls[0][4] as string);
      expect(payload).toEqual({
        room_id: `consult_${bookingId}`,
        privilege: { '1': 1, '2': 1 },
      });
      expect(generateToken04Spy).toHaveBeenCalledWith(
        123456,
        customerUserId,
        config.zegoServerSecret,
        7200,
        expect.any(String),
      );
    });

    it('allows the assigned expert', async () => {
      userRepo.findOne.mockResolvedValue({
        id: expertUserId,
        name: 'Dr Expert',
      });

      const result = await service.generateVideoToken(expertUserId, bookingId);

      expect(result.userID).toBe(expertUserId);
      expect(result.userName).toBe('Dr Expert');
      expect(result.roomID).toBe(`consult_${bookingId}`);
    });

    it('forbids a user who is not on the booking', async () => {
      await expect(
        service.generateVideoToken('u-outsider', bookingId),
      ).rejects.toThrow(ForbiddenException);
      expect(generateToken04Spy).not.toHaveBeenCalled();
    });

    it('throws NotFound when booking is missing', async () => {
      consultationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateVideoToken(customerUserId, bookingId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when Zego env is not configured', async () => {
      config.zegoAppId = '';
      config.zegoServerSecret = '';

      await expect(
        service.generateVideoToken(customerUserId, bookingId),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('generateChatToken', () => {
    it('returns a chat token with peer expert for the customer', async () => {
      const result = await service.generateChatToken(customerUserId, bookingId);

      expect(result).toEqual({
        appID: 123456,
        token: '04AAAA_test_token',
        userID: customerUserId,
        userName: 'Nguyen Van A',
        peerUserID: expertUserId,
        peerUserName: 'Dr. Tran B',
      });
      expect(generateToken04Spy).toHaveBeenCalledWith(
        123456,
        customerUserId,
        config.zegoServerSecret,
        7200,
        '',
      );
    });

    it('returns a chat token with peer customer for the expert', async () => {
      const result = await service.generateChatToken(expertUserId, bookingId);

      expect(result).toEqual({
        appID: 123456,
        token: '04AAAA_test_token',
        userID: expertUserId,
        userName: 'Dr. Tran B',
        peerUserID: customerUserId,
        peerUserName: 'Nguyen Van A',
      });
      expect(generateToken04Spy).toHaveBeenCalledWith(
        123456,
        expertUserId,
        config.zegoServerSecret,
        7200,
        '',
      );
    });

    it('forbids a user who is not on the booking', async () => {
      await expect(
        service.generateChatToken('u-outsider', bookingId),
      ).rejects.toThrow(ForbiddenException);
      expect(generateToken04Spy).not.toHaveBeenCalled();
    });

    it('throws NotFound when booking is missing', async () => {
      consultationRepo.findOne.mockResolvedValue(null);

      await expect(
        service.generateChatToken(customerUserId, bookingId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws Conflict when expert is not assigned yet', async () => {
      consultationRepo.findOne.mockResolvedValue({
        id: bookingId,
        customerId: 'cust-1',
        expertId: null,
        customer: { userId: customerUserId },
        expert: null,
      });

      await expect(
        service.generateChatToken(customerUserId, bookingId),
      ).rejects.toThrow(ConflictException);
      expect(generateToken04Spy).not.toHaveBeenCalled();
    });

    it('throws when Zego env is not configured', async () => {
      config.zegoAppId = '';
      config.zegoServerSecret = '';

      await expect(
        service.generateChatToken(customerUserId, bookingId),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
