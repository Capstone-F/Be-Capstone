import { UnauthorizedException } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ZegoTokenService } from '../modules/zego/zego-token.service';

describe('ConsultationsController', () => {
  const zegoTokenService = {
    generateVideoToken: jest.fn(),
  } as unknown as jest.Mocked<ZegoTokenService>;

  const controller = new ConsultationsController(zegoTokenService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getVideoToken uses auth userId and bookingId', async () => {
    zegoTokenService.generateVideoToken.mockResolvedValue({
      appID: 123456,
      token: '04AAAA',
      roomID: 'consult_b1',
      userID: 'u-1',
      userName: 'A',
    } as any);
    const req = {
      authContext: { userId: 'u-1', roles: [] },
      session: {},
    } as any;

    await controller.getVideoToken(req, 'b1');

    expect(zegoTokenService.generateVideoToken).toHaveBeenCalledWith(
      'u-1',
      'b1',
    );
  });

  it('getVideoToken rejects when not authenticated', () => {
    const req = { session: {} } as any;
    expect(() => controller.getVideoToken(req, 'b1')).toThrow(
      UnauthorizedException,
    );
    expect(zegoTokenService.generateVideoToken).not.toHaveBeenCalled();
  });
});
