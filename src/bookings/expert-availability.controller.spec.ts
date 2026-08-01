import { ExpertAvailabilityController } from './expert-availability.controller';
import { ExpertAvailabilityService } from './expert-availability.service';

describe('ExpertAvailabilityController', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const controller = new ExpertAvailabilityController(
    service as unknown as ExpertAvailabilityService,
  );

  const req = {
    authContext: {
      userId: 'user-1',
      roles: ['expert'],
      clinicId: 'clinic-1',
    },
  } as never;

  afterEach(() => jest.clearAllMocks());

  it('should list availability', async () => {
    service.list.mockResolvedValue({ items: [] });
    await controller.list(req, 'expert-1');
    expect(service.list).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'expert-1',
    );
  });

  it('should create availability', async () => {
    const body = { dayOfWeek: 1, startHour: 9, endHour: 12 };
    service.create.mockResolvedValue({ id: 'av-1', ...body });
    await controller.create(req, 'expert-1', body);
    expect(service.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'expert-1',
      body,
    );
  });

  it('should update availability', async () => {
    const body = { startHour: 10 };
    service.update.mockResolvedValue({ id: 'av-1' });
    await controller.update(req, 'expert-1', 'av-1', body);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'expert-1',
      'av-1',
      body,
    );
  });

  it('should remove availability', async () => {
    service.remove.mockResolvedValue(undefined);
    await controller.remove(req, 'expert-1', 'av-1');
    expect(service.remove).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      'expert-1',
      'av-1',
    );
  });
});
