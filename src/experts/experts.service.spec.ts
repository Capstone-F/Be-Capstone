import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { Clinic } from '../clinics/clinic.entity';
import { ClinicsService } from '../clinics/clinics.service';
import { Feedback } from '../consultations/feedback.entity';
import { Expert } from '../users/expert.entity';
import { User } from '../users/user.entity';
import { CallerContext } from '../users/users.service';
import { ExpertSpecialty } from './expert-specialty.enum';
import { ExpertsService } from './experts.service';

const makeClinic = (overrides: Partial<Clinic> = {}): Clinic =>
  ({
    id: 'clinic-1',
    name: 'GlowScan Clinic',
    address: '12 Nguyen Hue, District 1',
    latitude: 10.7769,
    longitude: 106.7009,
    isActive: true,
    ...overrides,
  }) as Clinic;

const makeExpert = (overrides: Partial<Expert> = {}): Expert => ({
  id: 'expert-1',
  userId: 'user-1',
  clinicId: 'clinic-1',
  specialization: ExpertSpecialty.DERMATOLOGY,
  licenseNumber: 'LIC-001',
  bio: 'Expert bio',
  avatarUrl: null,
  rating: 4.5,
  consultationFee: 300000,
  sessionLengthHours: 1,
  isActive: true,
  user: {
    id: 'user-1',
    name: 'Dr. Expert',
    email: 'expert@example.com',
    roles: [Role.Expert],
    clinicId: 'clinic-1',
  } as User,
  clinic: makeClinic(),
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

type MockQb = {
  leftJoinAndSelect: jest.Mock;
  innerJoinAndSelect: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  getMany: jest.Mock;
  getManyAndCount: jest.Mock;
  getRawOne: jest.Mock;
};

const makeQueryBuilder = (experts: Expert[] = [], total?: number): MockQb => ({
  leftJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoinAndSelect: jest.fn().mockReturnThis(),
  innerJoin: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  take: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  addSelect: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(experts),
  getManyAndCount: jest
    .fn()
    .mockResolvedValue([experts, total ?? experts.length]),
  getRawOne: jest.fn().mockResolvedValue(null),
});

const adminCaller: CallerContext = {
  userId: 'admin-1',
  roles: [Role.AppAdmin],
  clinicId: null,
};

const managerCaller: CallerContext = {
  userId: 'mgr-1',
  roles: [Role.ClinicManager],
  clinicId: 'clinic-1',
};

describe('ExpertsService', () => {
  afterEach(() => jest.clearAllMocks());

  function makeService(
    options: {
      experts?: Expert[];
      findOne?: Expert | null;
      user?: User | null;
      existingByUserId?: Expert | null;
      clinic?: Clinic;
      feedbacks?: Feedback[];
      feedbackTotal?: number;
      feedbackAgg?: { avg: string | null; count: string };
    } = {},
  ) {
    const qb = makeQueryBuilder(options.experts ?? [makeExpert()]);
    const expertRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(qb),
      findOne: jest
        .fn()
        .mockResolvedValue(
          options.findOne !== undefined ? options.findOne : makeExpert(),
        ),
      findOneBy: jest
        .fn()
        .mockResolvedValue(
          options.existingByUserId !== undefined
            ? options.existingByUserId
            : null,
        ),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation(async (v) => ({
        ...v,
        id: v.id ?? 'expert-new',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      })),
      update: jest.fn(),
    } as unknown as Repository<Expert>;

    const userRepo = {
      findOneBy: jest.fn().mockResolvedValue(
        options.user ??
          ({
            id: 'user-1',
            roles: [Role.Expert],
            clinicId: 'clinic-1',
          } as User),
      ),
      save: jest.fn().mockImplementation(async (v) => v),
      update: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<User>;

    const feedbackQb = makeQueryBuilder();
    feedbackQb.getManyAndCount.mockResolvedValue([
      options.feedbacks ?? [],
      options.feedbackTotal ?? (options.feedbacks ?? []).length,
    ]);
    feedbackQb.getRawOne.mockResolvedValue(
      options.feedbackAgg ?? { avg: null, count: '0' },
    );

    const feedbackRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(feedbackQb),
    } as unknown as Repository<Feedback>;

    const clinicsService = {
      requireById: jest.fn().mockResolvedValue(options.clinic ?? makeClinic()),
    } as unknown as ClinicsService;

    const service = new ExpertsService(
      expertRepo,
      userRepo,
      feedbackRepo,
      clinicsService,
    );
    return {
      service,
      expertRepo,
      userRepo,
      feedbackRepo,
      feedbackQb,
      clinicsService,
      qb,
    };
  }

  it('should apply specialization, rating, and fee filters in QueryBuilder', async () => {
    const { service, expertRepo, qb } = makeService();

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

  it('should filter by clinicId when provided', async () => {
    const { service, qb } = makeService();

    await service.findMany({ clinicId: 'clinic-1' });

    expect(qb.andWhere).toHaveBeenCalledWith('expert.clinicId = :clinicId', {
      clinicId: 'clinic-1',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'clinic.isActive = :clinicActive',
      { clinicActive: true },
    );
  });

  it('should throw BadRequestException when only lat is provided', async () => {
    const { service } = makeService();

    await expect(service.findMany({ lat: 10.7769 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw BadRequestException when only lng is provided', async () => {
    const { service } = makeService();

    await expect(service.findMany({ lng: 106.7009 })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should filter and sort by distance when lat/lng provided', async () => {
    const nearExpert = makeExpert({
      id: 'near',
      clinic: makeClinic({
        id: 'clinic-near',
        name: 'Near Clinic',
        latitude: 10.777,
        longitude: 106.701,
      }),
    });
    const farExpert = makeExpert({
      id: 'far',
      clinic: makeClinic({
        id: 'clinic-far',
        name: 'Far Clinic',
        latitude: 21.0285,
        longitude: 105.8542,
      }),
    });

    const { service, qb } = makeService({ experts: [farExpert, nearExpert] });

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

  it('should return expert detail with clinic summary', async () => {
    const { service } = makeService({ findOne: makeExpert() });

    const result = await service.findOne('expert-1');

    expect(result.id).toBe('expert-1');
    expect(result.name).toBe('Dr. Expert');
    expect(result.rating).toBe(4.5);
    expect(result.consultationFee).toBe(300000);
    expect(result.distanceKm).toBeNull();
    expect(result.clinicId).toBe('clinic-1');
    expect(result.clinic).toEqual({
      id: 'clinic-1',
      name: 'GlowScan Clinic',
      address: '12 Nguyen Hue, District 1',
    });
  });

  it('should throw NotFoundException when expert does not exist', async () => {
    const { service } = makeService({ findOne: null });

    await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
  });

  describe('getOwnProfile', () => {
    it('should return mapped expert profile for userId', async () => {
      const { service, expertRepo } = makeService({ findOne: makeExpert() });

      const result = await service.getOwnProfile('user-1');

      expect(expertRepo.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        relations: ['user', 'clinic'],
      });
      expect(result.id).toBe('expert-1');
      expect(result.name).toBe('Dr. Expert');
      expect(result.email).toBe('expert@example.com');
      expect(result.clinicId).toBe('clinic-1');
      expect(result.distanceKm).toBeNull();
    });

    it('should throw NotFoundException when expert profile is missing', async () => {
      const { service } = makeService({ findOne: null });

      await expect(service.getOwnProfile('user-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create expert profile and sync user.clinicId', async () => {
      const { service, expertRepo, userRepo, clinicsService } = makeService({
        findOne: makeExpert({ id: 'expert-new' }),
      });

      // first findOneBy for existing profile = null; findOne after save returns expert
      (expertRepo.findOneBy as jest.Mock).mockResolvedValueOnce(null);
      (expertRepo.findOne as jest.Mock).mockResolvedValue(
        makeExpert({ id: 'expert-new' }),
      );

      const result = await service.create(adminCaller, {
        userId: 'user-1',
        clinicId: 'clinic-1',
        specialization: ExpertSpecialty.DERMATOLOGY,
      });

      expect(clinicsService.requireById).toHaveBeenCalledWith('clinic-1');
      expect(expertRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          clinicId: 'clinic-1',
          specialization: ExpertSpecialty.DERMATOLOGY,
          isActive: true,
        }),
      );
      expect(userRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ clinicId: 'clinic-1' }),
      );
      expect(result.clinic.id).toBe('clinic-1');
    });

    it('should reject create without clinicId', async () => {
      const { service } = makeService();

      await expect(
        service.create(adminCaller, {
          userId: 'user-1',
          clinicId: '',
          specialization: ExpertSpecialty.DERMATOLOGY,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate expert profile', async () => {
      const { service } = makeService({ existingByUserId: makeExpert() });

      await expect(
        service.create(adminCaller, {
          userId: 'user-1',
          clinicId: 'clinic-1',
          specialization: ExpertSpecialty.DERMATOLOGY,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject user without expert role', async () => {
      const { service } = makeService({
        user: { id: 'user-1', roles: [Role.Customer] } as User,
      });

      await expect(
        service.create(adminCaller, {
          userId: 'user-1',
          clinicId: 'clinic-1',
          specialization: ExpertSpecialty.DERMATOLOGY,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should scope clinic_manager to own clinic', async () => {
      const { service } = makeService();

      await expect(
        service.create(managerCaller, {
          userId: 'user-1',
          clinicId: 'other-clinic',
          specialization: ExpertSpecialty.DERMATOLOGY,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update clinic and sync user.clinicId', async () => {
      const { service, userRepo, clinicsService } = makeService({
        findOne: makeExpert(),
        clinic: makeClinic({ id: 'clinic-2', name: 'Other' }),
      });
      (clinicsService.requireById as jest.Mock).mockResolvedValue(
        makeClinic({ id: 'clinic-2', name: 'Other', address: 'Addr 2' }),
      );

      // requireExpert called twice (load + reload)
      const updated = makeExpert({
        clinicId: 'clinic-2',
        clinic: makeClinic({
          id: 'clinic-2',
          name: 'Other',
          address: 'Addr 2',
        }),
      });
      const expertRepoFindOne = (service as any).expertRepository
        .findOne as jest.Mock;
      expertRepoFindOne
        .mockResolvedValueOnce(makeExpert())
        .mockResolvedValueOnce(updated);

      const result = await service.update(adminCaller, 'expert-1', {
        clinicId: 'clinic-2',
      });

      expect(clinicsService.requireById).toHaveBeenCalledWith('clinic-2');
      expect(userRepo.update).toHaveBeenCalledWith(
        { id: 'user-1' },
        { clinicId: 'clinic-2' },
      );
      expect(result.clinicId).toBe('clinic-2');
    });

    it('should reject clearing clinicId', async () => {
      const { service } = makeService({ findOne: makeExpert() });

      await expect(
        service.update(adminCaller, 'expert-1', {
          clinicId: '' as unknown as string,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject clinic_manager updating another clinic expert', async () => {
      const { service } = makeService({
        findOne: makeExpert({ clinicId: 'other-clinic' }),
      });

      await expect(
        service.update(managerCaller, 'expert-1', { bio: 'x' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update avatarUrl for admin', async () => {
      const updated = makeExpert({
        avatarUrl: 'https://placehold.co/400',
      });
      const { service, expertRepo } = makeService({
        findOne: makeExpert(),
      });
      (expertRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(makeExpert())
        .mockResolvedValueOnce(updated);

      const result = await service.update(adminCaller, 'expert-1', {
        avatarUrl: 'https://placehold.co/400',
      });

      expect(result.avatarUrl).toBe('https://placehold.co/400');
    });
  });

  describe('updateOwnAvatar', () => {
    it('should update avatar for the authenticated expert', async () => {
      const { service, expertRepo } = makeService({});
      (expertRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(makeExpert())
        .mockResolvedValueOnce(
          makeExpert({ avatarUrl: 'https://placehold.co/400' }),
        );
      (expertRepo.save as jest.Mock).mockImplementation(async (e) => e);

      const result = await service.updateOwnAvatar(
        'user-1',
        'https://placehold.co/400',
      );

      expect(result.avatarUrl).toBe('https://placehold.co/400');
    });

    it('should throw when expert profile is missing', async () => {
      const { service, expertRepo } = makeService({});
      (expertRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(
        service.updateOwnAvatar('user-1', 'https://placehold.co/400'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findFeedbacksByExpertId', () => {
    it('should return paginated feedbacks with average rating', async () => {
      const feedback = {
        id: 'fb-1',
        consultationId: 'booking-1',
        rating: 5,
        comment: 'Great',
        createdAt: new Date('2026-07-01'),
        consultation: {
          customer: { user: { name: 'Jane Doe' } },
        },
      } as Feedback;

      const { service, feedbackRepo, feedbackQb } = makeService({
        findOne: makeExpert(),
        feedbacks: [feedback],
        feedbackTotal: 1,
        feedbackAgg: { avg: '4.50', count: '2' },
      });

      const result = await service.findFeedbacksByExpertId('expert-1', {
        page: 1,
        limit: 10,
      });

      expect(feedbackRepo.createQueryBuilder).toHaveBeenCalledWith('f');
      expect(feedbackQb.where).toHaveBeenCalledWith('c.expertId = :expertId', {
        expertId: 'expert-1',
      });
      expect(result).toEqual({
        items: [
          {
            id: 'fb-1',
            consultationId: 'booking-1',
            rating: 5,
            comment: 'Great',
            customerName: 'Jane Doe',
            createdAt: feedback.createdAt,
          },
        ],
        total: 1,
        page: 1,
        limit: 10,
        averageRating: 4.5,
        ratingCount: 2,
      });
    });

    it('should throw when expert does not exist', async () => {
      const { service } = makeService({ findOne: null });

      await expect(
        service.findFeedbacksByExpertId('missing', {}),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
