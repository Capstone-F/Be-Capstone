import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UsersService } from './users.service';

const makeRepo = (overrides: Partial<Repository<User>> = {}) =>
  ({
    findOneBy: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    ...overrides,
  }) as unknown as Repository<User>;

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
        isActive: true,
      };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(saved),
        save: jest.fn().mockResolvedValue(saved),
      });
      const service = new UsersService(repo);

      const result = await service.upsertFromKeycloak(baseProfile, 'google');

      expect(repo.findOneBy).toHaveBeenCalledWith({
        keycloakSub: 'kc-sub-001',
      });
      expect(repo.create).toHaveBeenCalledWith({
        keycloakSub: 'kc-sub-001',
        email: 'user@example.com',
        name: 'John Doe',
        provider: 'google',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.isNewUser).toBe(true);
      expect(result.user).toEqual(saved);
    });

    it('should fall back to preferred_username when name is absent', async () => {
      const profile = { sub: 'kc-sub-002', preferred_username: 'johnd' };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      await service.upsertFromKeycloak(profile, 'keycloak');

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'johnd' }),
      );
    });

    it('should default provider to keycloak when not supplied', async () => {
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      await service.upsertFromKeycloak(baseProfile);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'keycloak' }),
      );
    });
  });

  describe('upsertFromKeycloak — existing user', () => {
    it('should update email and name then return isNewUser=false', async () => {
      const existing = {
        id: 'uuid-1',
        keycloakSub: 'kc-sub-001',
        email: 'old@example.com',
        name: 'Old Name',
        provider: 'google',
      } as User;
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      const result = await service.upsertFromKeycloak(baseProfile, 'google');

      expect(repo.create).not.toHaveBeenCalled();
      expect(existing.email).toBe('user@example.com');
      expect(existing.name).toBe('John Doe');
      expect(result.isNewUser).toBe(false);
    });
  });

  describe('findByKeycloakSub', () => {
    it('should return user when found', async () => {
      const user = { keycloakSub: 'kc-sub-001' } as User;
      const repo = makeRepo({ findOneBy: jest.fn().mockResolvedValue(user) });
      const service = new UsersService(repo);

      await expect(service.findByKeycloakSub('kc-sub-001')).resolves.toEqual(
        user,
      );
    });

    it('should return null when not found', async () => {
      const repo = makeRepo({ findOneBy: jest.fn().mockResolvedValue(null) });
      const service = new UsersService(repo);

      await expect(service.findByKeycloakSub('missing')).resolves.toBeNull();
    });
  });
});
