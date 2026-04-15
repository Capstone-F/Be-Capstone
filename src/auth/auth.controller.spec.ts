import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  const authService = {
    getOidcEndpoints: jest.fn(),
    getLoginUrl: jest.fn(),
    exchangeAuthorizationCode: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    getUserInfo: jest.fn(),
  } as unknown as jest.Mocked<AuthService>;
  const controller = new AuthController(authService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return oidc endpoints', () => {
    authService.getOidcEndpoints.mockReturnValue({ issuer: 'x' } as never);
    expect(controller.getEndpoints()).toEqual({ issuer: 'x' });
  });

  it('should pass idpHint=google to getLoginUrl', () => {
    authService.getLoginUrl.mockReturnValue({ authorizationUrl: 'http://kc/auth?kc_idp_hint=google' } as never);
    controller.getLoginUrl(undefined, 'google');
    expect(authService.getLoginUrl).toHaveBeenCalledWith(undefined, 'google');
  });

  it('should throw if callback code is missing', () => {
    expect(() => controller.exchangeAuthorizationCode(undefined)).toThrow(
      BadRequestException,
    );
  });

  it('should exchange callback code', async () => {
    authService.exchangeAuthorizationCode.mockResolvedValue({ ok: true } as never);
    await expect(controller.exchangeAuthorizationCode('abc')).resolves.toEqual({
      ok: true,
    });
  });

  it('should throw if refresh token missing', () => {
    expect(() => controller.refreshToken({} as never)).toThrow(BadRequestException);
  });

  it('should throw when authorization header is invalid', () => {
    expect(() => controller.getProfile('invalid')).toThrow(UnauthorizedException);
  });
});
