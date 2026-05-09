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
  sub: 'auth0|001',
  email: 'user@example.com',
  name: 'John Doe',
};

describe('UsersService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('upsertFromAuth0 — new user', () => {
    it('should create and return user with isNewUser=true', async () => {
      const saved: Partial<User> = {
        id: 'uuid-1',
        auth0Sub: 'auth0|001',
        email: 'user@example.com',
        name: 'John Doe',
        isActive: true,
      };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockReturnValue(saved),
        save: jest.fn().mockResolvedValue(saved),
      });
      const service = new UsersService(repo);

      const result = await service.upsertFromAuth0(baseProfile);

      expect(repo.findOneBy).toHaveBeenCalledWith({ auth0Sub: 'auth0|001' });
      expect(repo.create).toHaveBeenCalledWith({
        auth0Sub: 'auth0|001',
        email: 'user@example.com',
        name: 'John Doe',
      });
      expect(repo.save).toHaveBeenCalledTimes(1);
      expect(result.isNewUser).toBe(true);
      expect(result.user).toEqual(saved);
    });

    it('should fall back to nickname when name is absent', async () => {
      const profile = { sub: 'auth0|002', nickname: 'johnd' };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      await service.upsertFromAuth0(profile);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'johnd' }),
      );
    });

    it('should fall back to preferred_username when name and nickname are absent', async () => {
      const profile = { sub: 'auth0|003', preferred_username: 'johnpu' };
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((v) => v),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      await service.upsertFromAuth0(profile);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'johnpu' }),
      );
    });
  });

  describe('upsertFromAuth0 — existing user', () => {
    it('should update email and name then return isNewUser=false', async () => {
      const existing = {
        id: 'uuid-1',
        auth0Sub: 'auth0|001',
        email: 'old@example.com',
        name: 'Old Name',
      } as User;
      const repo = makeRepo({
        findOneBy: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
        save: jest.fn().mockImplementation((v) => Promise.resolve(v)),
      });
      const service = new UsersService(repo);

      const result = await service.upsertFromAuth0(baseProfile);

      expect(repo.create).not.toHaveBeenCalled();
      expect(existing.email).toBe('user@example.com');
      expect(existing.name).toBe('John Doe');
      expect(result.isNewUser).toBe(false);
    });
  });

  describe('findByAuth0Sub', () => {
    it('should return user when found', async () => {
      const user = { auth0Sub: 'auth0|001' } as User;
      const repo = makeRepo({ findOneBy: jest.fn().mockResolvedValue(user) });
      const service = new UsersService(repo);

      await expect(service.findByAuth0Sub('auth0|001')).resolves.toEqual(user);
    });

    it('should return null when not found', async () => {
      const repo = makeRepo({ findOneBy: jest.fn().mockResolvedValue(null) });
      const service = new UsersService(repo);

      await expect(service.findByAuth0Sub('missing')).resolves.toBeNull();
    });
  });
});
