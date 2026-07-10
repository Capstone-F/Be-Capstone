import { UnauthorizedException } from '@nestjs/common';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileAuthService } from './mobile-auth.service';

describe('MobileAuthController', () => {
  const mobileAuthService = {
    exchangeCode: jest.fn(),
    refresh: jest.fn(),
  } as unknown as jest.Mocked<MobileAuthService>;

  const controller = new MobileAuthController(mobileAuthService);

  beforeEach(() => jest.clearAllMocks());

  describe('POST /auth/mobile/exchange', () => {
    it('should return tokens on success', async () => {
      const response = {
        accessToken: 'at',
        refreshToken: 'rt',
        expiresIn: 900,
        user: { id: 'u1' },
        isNewUser: false,
      };
      mobileAuthService.exchangeCode.mockResolvedValue(response as any);

      await expect(controller.exchange({ code: 'good-code' })).resolves.toEqual(
        response,
      );
      expect(mobileAuthService.exchangeCode).toHaveBeenCalledWith('good-code');
    });

    it('should propagate 401 for invalid code', async () => {
      mobileAuthService.exchangeCode.mockRejectedValue(
        new UnauthorizedException('Invalid, expired, or already used code'),
      );

      await expect(controller.exchange({ code: 'bad' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('POST /auth/mobile/refresh', () => {
    it('should return new tokens on success', async () => {
      mobileAuthService.refresh.mockResolvedValue({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresIn: 900,
      });

      await expect(
        controller.refresh({ refreshToken: 'old-rt' }),
      ).resolves.toEqual({
        accessToken: 'new-at',
        refreshToken: 'new-rt',
        expiresIn: 900,
      });
    });

    it('should propagate 401 for invalid refresh token', async () => {
      mobileAuthService.refresh.mockRejectedValue(
        new UnauthorizedException('Invalid or expired refresh token'),
      );

      await expect(
        controller.refresh({ refreshToken: 'bad' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });
});
