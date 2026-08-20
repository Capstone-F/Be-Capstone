import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';
import { ClinicsService } from './clinics.service';

const makeClinic = (overrides: Partial<Clinic> = {}): Clinic => ({
  id: 'clinic-1',
  name: 'GlowScan Clinic',
  address: '12 Nguyen Hue',
  latitude: 10.7769,
  longitude: 106.7009,
  isActive: true,
  commissionRatePct: '10',
  bankName: null,
  bankAccountNumber: null,
  bankAccountHolder: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

describe('ClinicsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should list active clinics paginated', async () => {
    const clinics = [makeClinic(), makeClinic({ id: 'clinic-2', name: 'B' })];
    const clinicRepo = {
      findAndCount: jest.fn().mockResolvedValue([clinics, 2]),
      findOneBy: jest.fn(),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.findMany({ page: 1, limit: 20 });

    expect(clinicRepo.findAndCount).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
      skip: 0,
      take: 20,
    });
    expect(result.total).toBe(2);
    expect(result.items[0].id).toBe('clinic-1');
    expect(result.items[0].latitude).toBe(10.7769);
  });

  it('should list clinics for admin including inactive and name search', async () => {
    const clinics = [
      makeClinic(),
      makeClinic({ id: 'clinic-2', name: 'Other', isActive: false }),
    ];
    const qb = {
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([clinics, 2]),
    };
    const clinicRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.adminFindMany({
      q: 'glow',
      activeOnly: true,
      page: 1,
      limit: 20,
    });

    expect(clinicRepo.createQueryBuilder).toHaveBeenCalledWith('clinic');
    expect(qb.andWhere).toHaveBeenCalledWith('clinic.isActive = :isActive', {
      isActive: true,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'LOWER(clinic.name) LIKE LOWER(:q)',
      { q: '%glow%' },
    );
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].commissionPercent).toBe(10);
  });

  it('should return clinic detail', async () => {
    const clinicRepo = {
      findOneBy: jest.fn().mockResolvedValue(makeClinic()),
      findAndCount: jest.fn(),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.findOne('clinic-1');
    expect(result.name).toBe('GlowScan Clinic');
    expect(result.address).toBe('12 Nguyen Hue');
  });

  it('should throw NotFoundException when clinic missing', async () => {
    const clinicRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn(),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  it('should create a clinic', async () => {
    const created = makeClinic({ id: 'new-clinic', name: 'New Clinic' });
    const clinicRepo = {
      create: jest.fn().mockImplementation((input) => input),
      save: jest.fn().mockResolvedValue(created),
      findOneBy: jest.fn(),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.create({
      name: '  New Clinic  ',
      address: '  1 Main St  ',
      latitude: 10.1,
      longitude: 106.2,
    });

    expect(clinicRepo.create).toHaveBeenCalledWith({
      name: 'New Clinic',
      address: '1 Main St',
      latitude: 10.1,
      longitude: 106.2,
      isActive: true,
      commissionRatePct: '10',
    });
    expect(result.id).toBe('new-clinic');
    expect(result.name).toBe('New Clinic');
    expect(result.commissionPercent).toBe(10);
  });

  it('should update a clinic', async () => {
    const clinic = makeClinic();
    const clinicRepo = {
      findOneBy: jest.fn().mockResolvedValue(clinic),
      save: jest.fn().mockImplementation(async (entity) => entity),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.update('clinic-1', {
      name: ' Renamed ',
      address: null,
      isActive: false,
    });

    expect(result.name).toBe('Renamed');
    expect(result.address).toBeNull();
    expect(result.isActive).toBe(false);
    expect(clinicRepo.save).toHaveBeenCalled();
  });

  it('should soft-deactivate a clinic', async () => {
    const clinic = makeClinic();
    const clinicRepo = {
      findOneBy: jest.fn().mockResolvedValue(clinic),
      save: jest.fn().mockImplementation(async (entity) => entity),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.deactivate('clinic-1');

    expect(result.isActive).toBe(false);
    expect(clinicRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
  });

  it('updates commission for only the selected clinic', async () => {
    const clinic = makeClinic();
    const clinicRepo = {
      findOneBy: jest.fn().mockResolvedValue(clinic),
      save: jest.fn().mockImplementation(async (entity) => entity),
    } as unknown as Repository<Clinic>;
    const service = new ClinicsService(clinicRepo);

    const result = await service.updateCommission('clinic-1', 12.5);

    expect(clinicRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'clinic-1', commissionRatePct: '12.5' }),
    );
    expect(result.commissionPercent).toBe(12.5);
  });
});
