import { UnauthorizedException } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController', () => {
  const customersService = {
    getOwnCustomerProfile: jest.fn(),
    updateOwnCustomerProfile: jest.fn(),
    updateOwnSkinType: jest.fn(),
    getAllergyOptions: jest.fn(),
    getConsultationContext: jest.fn(),
  } as unknown as jest.Mocked<CustomersService>;

  const controller = new CustomersController(customersService);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getMe should use Bearer authContext userId', async () => {
    customersService.getOwnCustomerProfile.mockResolvedValue({
      id: 'c1',
    } as any);
    const req = {
      authContext: { userId: 'u-bearer', roles: ['customer'] },
      session: {},
    } as any;

    await controller.getMe(req);

    expect(customersService.getOwnCustomerProfile).toHaveBeenCalledWith(
      'u-bearer',
    );
  });

  it('getMe should use session userId when no authContext', async () => {
    customersService.getOwnCustomerProfile.mockResolvedValue({
      id: 'c1',
    } as any);
    const req = { session: { userId: 'u-session' } } as any;

    await controller.getMe(req);

    expect(customersService.getOwnCustomerProfile).toHaveBeenCalledWith(
      'u-session',
    );
  });

  it('getMe should reject when neither authContext nor session', async () => {
    const req = { session: {} } as any;
    await expect(controller.getMe(req)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('updateMySkinType should pass skin type dto', async () => {
    customersService.updateOwnSkinType.mockResolvedValue({
      customer: null,
      allergies: [],
      surveyHistory: [],
      treatmentHistory: [],
    } as any);
    const req = {
      authContext: { userId: 'u-customer', roles: ['customer'] },
      session: {},
    } as any;

    await controller.updateMySkinType(req, { skinTypeCode: 'OSPT' });

    expect(customersService.updateOwnSkinType).toHaveBeenCalledWith(
      'u-customer',
      { skinTypeCode: 'OSPT' },
    );
  });

  it('getConsultationContext should pass consultationId query', async () => {
    customersService.getConsultationContext.mockResolvedValue({
      customer: null,
      allergies: [],
      surveyHistory: [],
      treatmentHistory: [],
    } as any);
    const req = {
      authContext: { userId: 'u-expert', roles: ['expert'] },
      session: {},
    } as any;

    await controller.getConsultationContext(req, 'customer-1', 'booking-1');

    expect(customersService.getConsultationContext).toHaveBeenCalledWith(
      'u-expert',
      'customer-1',
      'booking-1',
    );
  });
});
