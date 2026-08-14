import { UnauthorizedException } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

describe('PaymentsController', () => {
  const paymentsService = {
    checkout: jest.fn(),
    checkoutWithWallet: jest.fn(),
    getStatus: jest.fn(),
    handleReturn: jest.fn(),
    handleIpn: jest.fn(),
  } as unknown as jest.Mocked<PaymentsService>;

  const controller = new PaymentsController(paymentsService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checkout should use Bearer authContext userId', async () => {
    paymentsService.checkout.mockResolvedValue({
      paymentUrl: 'http://pay',
    } as any);
    const req = {
      authContext: { userId: 'u-bearer', roles: ['customer'] },
      session: {},
      ip: '127.0.0.1',
    } as any;
    const dto = { orderId: 'o1' };

    await controller.checkout(req, dto);

    expect(paymentsService.checkout).toHaveBeenCalledWith(
      'u-bearer',
      dto,
      '127.0.0.1',
    );
  });

  it('wallet checkout should use Bearer authContext userId', async () => {
    paymentsService.checkoutWithWallet.mockResolvedValue({
      paymentId: 'p1',
    } as any);
    const req = {
      authContext: { userId: 'u-bearer', roles: ['customer'] },
      session: {},
    } as any;
    const dto = { orderId: 'o1' };

    await controller.checkoutWithWallet(req, dto);

    expect(paymentsService.checkoutWithWallet).toHaveBeenCalledWith(
      'u-bearer',
      dto,
    );
  });

  it('getStatus should use Bearer authContext userId', async () => {
    paymentsService.getStatus.mockResolvedValue({ id: 'p1' } as any);
    const req = {
      authContext: { userId: 'u-bearer', roles: ['customer'] },
      session: {},
    } as any;

    await controller.getStatus(req, 'p1');

    expect(paymentsService.getStatus).toHaveBeenCalledWith('u-bearer', 'p1');
  });

  it('checkout should reject when not authenticated', () => {
    const req = { session: {}, ip: '127.0.0.1' } as any;
    expect(() => controller.checkout(req, {} as any)).toThrow(
      UnauthorizedException,
    );
  });
});
