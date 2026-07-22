import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';
import { ClinicsService } from './clinics.service';

const makeClinic = (overrides: Partial<Clinic> = {}): Clinic =>
  ({
    id: 'clinic-1',
    name: 'GlowScan Clinic',
    address: '12 Nguyen Hue',
    latitude: 10.7769,
    longitude: 106.7009,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as Clinic;

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
});
