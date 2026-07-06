import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Clinic } from '../clinics/clinic.entity';
import { Expert } from '../users/expert.entity';
import { User } from '../users/user.entity';
import { ExpertSpecialty } from './expert-specialty.enum';
import { ExpertsService } from './experts.service';

const makeExpert = (overrides: Partial<Expert> = {}): Expert => ({
  id: 'expert-1',
  userId: 'user-1',
  clinicId: 'clinic-1',
  specialization: ExpertSpecialty.DERMATOLOGY,
  licenseNumber: 'LIC-001',
  bio: 'Expert bio',
  rating: 4.5,
  consultationFee: 300000,
  isActive: true,
  user: {
    id: 'user-1',
    name: 'Dr. Expert',
    email: 'expert@example.com',
  } as User,
  clinic: {
    id: 'clinic-1',
    name: 'GlowScan Clinic',
    latitude: 10.7769,
    longitude: 106.7009,
  } as Clinic,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

type MockQb = {
  leftJoinAndSelect: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
};

const makeQueryBuilder = (experts: Expert[] = [], total?: number): MockQb => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(experts),
  getManyAndCount: jest
    .fn()
    .mockResolvedValue([experts, total ?? experts.length]),
});

describe('ExpertsService', () => {
  afterEach(() => jest.clearAllMocks());

  it('should apply specialization, rating, and fee filters in QueryBuilder', async () => {
    const qb = makeQueryBuilder([makeExpert()]);
    const expertRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    await service.findMany({
      specialization: ExpertSpecialty.DERMATOLOGY,
      minRating: 4,
      minFee: 100000,
      maxFee: 500000,
      page: 2,
      limit: 10,
    });

    expect(expertRepo.createQueryBuilder).toHaveBeenCalledWith('expert');
    expect(qb.andWhere).toHaveBeenCalledWith(
      'expert.specialization = :specialization',
      { specialization: ExpertSpecialty.DERMATOLOGY },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('expert.rating >= :minRating', {
      minRating: 4,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'expert.consultationFee >= :minFee',
      { minFee: 100000 },
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'expert.consultationFee <= :maxFee',
      { maxFee: 500000 },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('expert.rating', 'DESC');
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('should throw BadRequestException when only lat is provided', async () => {
    const expertRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    await expect(service.findMany({ lat: 10.7769 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when only lng is provided', async () => {
    const expertRepo = {
      createQueryBuilder: jest.fn(),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    await expect(service.findMany({ lng: 106.7009 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should filter and sort by distance when lat/lng provided', async () => {
    const nearExpert = makeExpert({
      id: 'near',
      clinic: {
        id: 'clinic-near',
        name: 'Near Clinic',
        latitude: 10.777,
        longitude: 106.701,
      } as Clinic,
    });
    const farExpert = makeExpert({
      id: 'far',
      clinic: {
        id: 'clinic-far',
        name: 'Far Clinic',
        latitude: 21.0285,
        longitude: 105.8542,
      } as Clinic,
    });

    const qb = makeQueryBuilder([farExpert, nearExpert]);
    const expertRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    const result = await service.findMany({
      lat: 10.7769,
      lng: 106.7009,
      radiusKm: 50,
      page: 1,
      limit: 10,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('near');
    expect(result.items[0].distanceKm).not.toBeNull();
    expect(result.items[0].distanceKm!).toBeLessThan(50);
    expect(qb.getMany).toHaveBeenCalled();
    expect(qb.skip).not.toHaveBeenCalled();
  });

  it('should return expert detail', async () => {
    const expertRepo = {
      findOne: jest.fn().mockResolvedValue(makeExpert()),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    const result = await service.findOne('expert-1');

    expect(result.id).toBe('expert-1');
    expect(result.name).toBe('Dr. Expert');
    expect(result.rating).toBe(4.5);
    expect(result.consultationFee).toBe(300000);
    expect(result.distanceKm).toBeNull();
  });

  it('should throw NotFoundException when expert does not exist', async () => {
    const expertRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<Expert>;
    const service = new ExpertsService(expertRepo);

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });
});
