import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { Expert } from '../users/expert.entity';
import { CallerContext } from '../users/users.service';
import { ExpertAvailability } from './expert-availability.entity';
import { ExpertAvailabilityService } from './expert-availability.service';

const makeExpert = (overrides: Partial<Expert> = {}): Expert =>
  ({
    id: 'expert-1',
    userId: 'user-expert-1',
    clinicId: 'clinic-1',
    ...overrides,
  }) as Expert;

const makeAvailability = (
  overrides: Partial<ExpertAvailability> = {},
): ExpertAvailability =>
  ({
    id: 'av-1',
    expertId: 'expert-1',
    dayOfWeek: 1,
    startHour: 9,
    endHour: 12,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as ExpertAvailability;

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

const otherManagerCaller: CallerContext = {
  userId: 'mgr-2',
  roles: [Role.ClinicManager],
  clinicId: 'clinic-2',
};

const expertCaller: CallerContext = {
  userId: 'user-expert-1',
  roles: [Role.Expert],
  clinicId: 'clinic-1',
};

const otherExpertCaller: CallerContext = {
  userId: 'user-expert-2',
  roles: [Role.Expert],
  clinicId: 'clinic-1',
};

describe('ExpertAvailabilityService', () => {
  afterEach(() => jest.clearAllMocks());

  function makeService(
    options: {
      expert?: Expert | null;
      rows?: ExpertAvailability[];
      findOneRow?: ExpertAvailability | null;
    } = {},
  ) {
    const expert = options.expert === undefined ? makeExpert() : options.expert;
    const rows = options.rows ?? [makeAvailability()];

    const expertRepo = {
      findOne: jest.fn().mockResolvedValue(expert),
    } as unknown as Repository<Expert>;

    const availabilityRepo = {
      find: jest.fn().mockResolvedValue(rows),
      findOne: jest
        .fn()
        .mockResolvedValue(
          options.findOneRow === undefined
            ? (rows[0] ?? null)
            : options.findOneRow,
        ),
      create: jest.fn((data: Partial<ExpertAvailability>) =>
        makeAvailability({ id: 'av-new', ...data }),
      ),
      save: jest.fn(async (row: ExpertAvailability) => row),
      remove: jest.fn().mockResolvedValue(undefined),
    } as unknown as Repository<ExpertAvailability>;

    const service = new ExpertAvailabilityService(expertRepo, availabilityRepo);
    return { service, expertRepo, availabilityRepo };
  }

  describe('list', () => {
    it('should list blocks for admin', async () => {
      const { service } = makeService();
      const result = await service.list(adminCaller, 'expert-1');
      expect(result.items).toHaveLength(1);
      expect(result.items[0].dayOfWeek).toBe(1);
    });

    it('should allow clinic manager for own clinic', async () => {
      const { service } = makeService();
      await expect(
        service.list(managerCaller, 'expert-1'),
      ).resolves.toBeDefined();
    });

    it('should forbid clinic manager for other clinic', async () => {
      const { service } = makeService();
      await expect(
        service.list(otherManagerCaller, 'expert-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should allow expert for own profile', async () => {
      const { service } = makeService();
      await expect(
        service.list(expertCaller, 'expert-1'),
      ).resolves.toBeDefined();
    });

    it('should forbid expert for another profile', async () => {
      const { service } = makeService();
      await expect(
        service.list(otherExpertCaller, 'expert-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should throw when expert is missing', async () => {
      const { service } = makeService({ expert: null });
      await expect(service.list(adminCaller, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a block', async () => {
      const { service, availabilityRepo } = makeService({ rows: [] });
      const result = await service.create(adminCaller, 'expert-1', {
        dayOfWeek: 2,
        startHour: 13,
        endHour: 18,
      });
      expect(availabilityRepo.create).toHaveBeenCalledWith({
        expertId: 'expert-1',
        dayOfWeek: 2,
        startHour: 13,
        endHour: 18,
      });
      expect(result.startHour).toBe(13);
      expect(result.endHour).toBe(18);
    });

    it('should reject invalid hour window', async () => {
      const { service } = makeService({ rows: [] });
      await expect(
        service.create(adminCaller, 'expert-1', {
          dayOfWeek: 1,
          startHour: 12,
          endHour: 12,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should reject overlapping blocks', async () => {
      const { service } = makeService({
        rows: [makeAvailability({ dayOfWeek: 1, startHour: 9, endHour: 12 })],
      });
      await expect(
        service.create(adminCaller, 'expert-1', {
          dayOfWeek: 1,
          startHour: 11,
          endHour: 14,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('should allow adjacent non-overlapping blocks', async () => {
      const { service } = makeService({
        rows: [makeAvailability({ dayOfWeek: 1, startHour: 9, endHour: 12 })],
      });
      await expect(
        service.create(adminCaller, 'expert-1', {
          dayOfWeek: 1,
          startHour: 12,
          endHour: 14,
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('update', () => {
    it('should update hours', async () => {
      const row = makeAvailability();
      const { service, availabilityRepo } = makeService({
        rows: [row],
        findOneRow: row,
      });
      (availabilityRepo.find as jest.Mock).mockResolvedValue([]);

      const result = await service.update(adminCaller, 'expert-1', 'av-1', {
        startHour: 10,
        endHour: 13,
      });
      expect(result.startHour).toBe(10);
      expect(result.endHour).toBe(13);
    });

    it('should throw when block is missing', async () => {
      const { service } = makeService({ findOneRow: null });
      await expect(
        service.update(adminCaller, 'expert-1', 'missing', { startHour: 10 }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('should reject overlap with another block', async () => {
      const row = makeAvailability({ id: 'av-1', startHour: 9, endHour: 12 });
      const { service, availabilityRepo } = makeService({
        findOneRow: row,
      });
      (availabilityRepo.find as jest.Mock).mockResolvedValue([
        makeAvailability({ id: 'av-2', startHour: 13, endHour: 18 }),
      ]);

      await expect(
        service.update(adminCaller, 'expert-1', 'av-1', {
          startHour: 12,
          endHour: 15,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('remove', () => {
    it('should delete a block', async () => {
      const row = makeAvailability();
      const { service, availabilityRepo } = makeService({ findOneRow: row });
      await service.remove(adminCaller, 'expert-1', 'av-1');
      expect(availabilityRepo.remove).toHaveBeenCalledWith(row);
    });

    it('should throw when block is missing', async () => {
      const { service } = makeService({ findOneRow: null });
      await expect(
        service.remove(adminCaller, 'expert-1', 'missing'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
