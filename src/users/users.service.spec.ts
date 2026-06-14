import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { ClinicsService } from '../clinics/clinics.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { User } from './user.entity';
import { UsersService } from './users.service';

const makeRepo = (overrides: Partial<Repository<User>> = {}) =>
  ({
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
    ...overrides,
  }) as unknown as Repository<User>;

const mockKeycloakAdmin = {
  getAdminToken: jest.fn(),
  createUser: jest.fn(),
  getRealmRole: jest.fn(),
  assignRealmRoles: jest.fn(),
  replaceUserAppRoles: jest.fn(),
  setUserEnabled: jest.fn(),
  setUserAttributes: jest.fn(),
  updateUser: jest.fn(),
} as unknown as jest.Mocked<KeycloakAdminService>;

const mockClinicsService = {
  requireById: jest.fn(),
} as unknown as jest.Mocked<ClinicsService>;

const baseProfile: Record<string, unknown> = {
  sub: 'kc-sub-001',
  email: 'user@example.com',
  name: 'John Doe',
};

describe('UsersService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('upsertFromKeycloak — new user', () => {
    it('should create and return user with isNewUser=true', async () => {
      const saved: Partial<User> = {
        id: 'uuid-1',
        keycloakSub: 'kc-sub-001',
        email: 'user@example.com',
        name: 'John Doe',
        provider: 'google',
        roles: [Role.Customer],
        isActive: true,
      };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(saved),
        save: jest.fn().mockResolvedValue(saved),
      });
      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      const result = await service.upsertFromKeycloak(baseProfile, 'google', [
        Role.Customer,
      ]);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          roles: [Role.Customer],
          clinicId: null,
        }),
      );
      expect(result.isNewUser).toBe(true);
    });
  });

  describe('upsertFromKeycloak — existing user', () => {
    it('should update email, name, and roles then return isNewUser=false', async () => {
      const existing = {
        id: 'uuid-1',
        keycloakSub: 'kc-sub-001',
        email: 'old@example.com',
        name: 'Old Name',
        provider: 'google',
        roles: [Role.Customer],
      } as User;
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(existing),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      const result = await service.upsertFromKeycloak(baseProfile, 'google', [
        Role.Staff,
      ]);

      expect(existing.roles).toEqual([Role.Staff]);
      expect(result.isNewUser).toBe(false);
    });
  });

  describe('createManagedUser', () => {
    it('should forbid clinic_manager from creating staff', async () => {
      const repo = makeRepo();
      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      await expect(
        service.createManagedUser(
          {
            userId: 'mgr-1',
            roles: [Role.ClinicManager],
            clinicId: 'clinic-1',
          },
          {
            email: 'staff@test.com',
            name: 'Staff User',
            role: Role.Staff,
            temporaryPassword: 'Temp123!',
          },
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('should allow clinic_manager to create expert in own clinic', async () => {
      const saved = {
        id: 'uuid-2',
        keycloakSub: 'kc-new',
        email: 'expert@test.com',
        name: 'Expert User',
        roles: [Role.Expert],
        clinicId: 'clinic-1',
      } as User;

      const repo = makeRepo({
        create: jest.fn().mockReturnValue(saved),
        save: jest.fn().mockResolvedValue(saved),
      });
      mockKeycloakAdmin.getAdminToken.mockResolvedValue('admin-token');
      mockKeycloakAdmin.createUser.mockResolvedValue('kc-new');
      mockKeycloakAdmin.getRealmRole.mockResolvedValue({
        id: 'role-id',
        name: Role.Expert,
      });
      mockClinicsService.requireById.mockResolvedValue({
        id: 'clinic-1',
        name: 'Clinic',
      } as never);

      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      const result = await service.createManagedUser(
        {
          userId: 'mgr-1',
          roles: [Role.ClinicManager],
          clinicId: 'clinic-1',
        },
        {
          email: 'expert@test.com',
          name: 'Expert User',
          role: Role.Expert,
          temporaryPassword: 'Temp123!',
        },
      );

      expect(result.clinicId).toBe('clinic-1');
      expect(mockKeycloakAdmin.createUser).toHaveBeenCalled();
      expect(mockClinicsService.requireById).toHaveBeenCalledWith('clinic-1');
    });
  });

  describe('getByIdForCaller', () => {
    it('should forbid clinic_manager accessing user outside clinic', async () => {
      const target = {
        id: 'user-2',
        clinicId: 'other-clinic',
      } as User;
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(target),
      });
      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      await expect(
        service.getByIdForCaller(
          {
            userId: 'mgr-1',
            roles: [Role.ClinicManager],
            clinicId: 'clinic-1',
          },
          'user-2',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('assignRoles', () => {
    it('should replace roles for app_admin', async () => {
      const user = {
        id: 'user-1',
        keycloakSub: 'kc-1',
        roles: [Role.Customer],
        clinicId: null,
      } as User;
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(user),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      mockKeycloakAdmin.getAdminToken.mockResolvedValue('admin-token');
      mockKeycloakAdmin.replaceUserAppRoles.mockResolvedValue(undefined);

      const service = new UsersService(
        repo,
        mockKeycloakAdmin,
        mockClinicsService,
      );

      const result = await service.assignRoles(
        { userId: 'admin-1', roles: [Role.AppAdmin] },
        'user-1',
        [Role.Staff],
      );

      expect(result.roles).toEqual([Role.Staff]);
      expect(mockKeycloakAdmin.replaceUserAppRoles).toHaveBeenCalled();
    });
  });
});
