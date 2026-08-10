import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { Role } from '../auth/roles.enum';
import { SupportMessageSenderRole, SupportSessionStatus } from './enums';
import { SupportMessage } from './support-message.entity';
import { SupportSession } from './support-session.entity';
import { SupportService } from './support.service';

type MockManager = {
  create: jest.Mock;
  save: jest.Mock;
  findOne: jest.Mock;
};

const makeManager = (overrides: Partial<MockManager> = {}): MockManager => ({
  create: jest.fn().mockImplementation((_, data) => ({ ...data })),
  save: jest
    .fn()
    .mockImplementation((_, v) =>
      Promise.resolve({ ...v, id: v.id ?? 'saved-id' }),
    ),
  findOne: jest.fn(),
  ...overrides,
});

const makeSessionRepo = (
  manager: MockManager,
  overrides: Record<string, unknown> = {},
) =>
  ({
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((data) => ({ ...data })),
    save: jest
      .fn()
      .mockImplementation((v) =>
        Promise.resolve({ ...v, id: v.id ?? 'session-1' }),
      ),
    createQueryBuilder: jest.fn(),
    manager: {
      transaction: jest.fn().mockImplementation((cb) => cb(manager)),
    },
    ...overrides,
  }) as unknown as Repository<SupportSession>;

const makeMessageRepo = (overrides: Record<string, unknown> = {}) =>
  ({
    createQueryBuilder: jest.fn(),
    ...overrides,
  }) as unknown as Repository<SupportMessage>;

const baseSession = (overrides: Partial<SupportSession> = {}): SupportSession =>
  ({
    id: 'session-1',
    customerUserId: 'customer-1',
    customerUser: {
      id: 'customer-1',
      name: 'Jane',
    } as SupportSession['customerUser'],
    status: SupportSessionStatus.OPEN,
    subject: 'Help',
    assignedStaffUserId: null,
    assignedStaffUser: null,
    assignedAt: null,
    messageCount: 0,
    customerLastReadSeq: 0,
    staffLastReadSeq: 0,
    lastMessageAt: null,
    lastMessagePreview: null,
    closedByUserId: null,
    closedAt: null,
    closeReason: null,
    messages: [],
    createdAt: new Date('2026-08-10T00:00:00.000Z'),
    updatedAt: new Date('2026-08-10T00:00:00.000Z'),
    ...overrides,
  }) as SupportSession;

describe('SupportService', () => {
  let service: SupportService;
  let sessionRepo: Repository<SupportSession>;
  let messageRepo: Repository<SupportMessage>;
  let manager: MockManager;

  beforeEach(() => {
    manager = makeManager();
    sessionRepo = makeSessionRepo(manager);
    messageRepo = makeMessageRepo();
    service = new SupportService(sessionRepo, messageRepo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('create', () => {
    it('returns existing live session instead of creating a new one', async () => {
      const existing = baseSession();
      (sessionRepo.findOne as jest.Mock).mockResolvedValue(existing);

      const result = await service.create('customer-1', {
        subject: 'Ignored',
      });

      expect(result.id).toBe('session-1');
      expect(sessionRepo.create).not.toHaveBeenCalled();
      expect(sessionRepo.save).not.toHaveBeenCalled();
    });

    it('creates a new OPEN session when none exists', async () => {
      (sessionRepo.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(baseSession());

      const result = await service.create('customer-1', {
        subject: 'Order issue',
      });

      expect(sessionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customerUserId: 'customer-1',
          status: SupportSessionStatus.OPEN,
          subject: 'Order issue',
        }),
      );
      expect(result.id).toBe('session-1');
    });
  });

  describe('claim', () => {
    it('throws ConflictException when another staff already claimed', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      (sessionRepo.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);
      (sessionRepo.findOne as jest.Mock).mockResolvedValue(
        baseSession({
          status: SupportSessionStatus.ACTIVE,
          assignedStaffUserId: 'staff-other',
        }),
      );

      await expect(service.claim('staff-1', 'session-1')).rejects.toThrow(
        ConflictException,
      );
    });

    it('throws NotFoundException when session does not exist', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 0 }),
      };
      (sessionRepo.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);
      (sessionRepo.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.claim('staff-1', 'missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('claims an OPEN session successfully', async () => {
      const updateQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      };
      (sessionRepo.createQueryBuilder as jest.Mock).mockReturnValue(updateQb);
      (sessionRepo.findOne as jest.Mock).mockResolvedValue(
        baseSession({
          status: SupportSessionStatus.ACTIVE,
          assignedStaffUserId: 'staff-1',
          assignedAt: new Date(),
          assignedStaffUser: {
            id: 'staff-1',
            name: 'Staff',
          } as SupportSession['assignedStaffUser'],
        }),
      );

      const result = await service.claim('staff-1', 'session-1');
      expect(result.assignedStaffUserId).toBe('staff-1');
      expect(result.status).toBe(SupportSessionStatus.ACTIVE);
    });
  });

  describe('sendMessage', () => {
    it('rejects unassigned staff', async () => {
      manager.findOne.mockResolvedValue(baseSession());

      await expect(
        service.sendMessage('session-1', 'staff-1', [Role.Staff], {
          content: 'Hello',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects messages on CLOSED sessions', async () => {
      manager.findOne.mockResolvedValue(
        baseSession({ status: SupportSessionStatus.CLOSED }),
      );

      await expect(
        service.sendMessage('session-1', 'customer-1', [Role.Customer], {
          content: 'Hello',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('increments seq from messageCount', async () => {
      const session = baseSession({
        status: SupportSessionStatus.ACTIVE,
        assignedStaffUserId: 'staff-1',
        messageCount: 2,
      });
      manager.findOne.mockResolvedValue(session);
      manager.save
        .mockResolvedValueOnce({
          id: 'msg-3',
          sessionId: 'session-1',
          seq: 3,
          senderUserId: 'staff-1',
          senderRole: SupportMessageSenderRole.STAFF,
          content: 'Reply',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({ ...session, messageCount: 3 });

      const result = await service.sendMessage(
        'session-1',
        'staff-1',
        [Role.Staff],
        { content: 'Reply' },
      );

      expect(manager.create).toHaveBeenCalledWith(
        SupportMessage,
        expect.objectContaining({
          seq: 3,
          senderRole: SupportMessageSenderRole.STAFF,
          content: 'Reply',
        }),
      );
      expect(result.seq).toBe(3);
      expect(session.messageCount).toBe(3);
    });

    it('allows customer to send while OPEN', async () => {
      const session = baseSession({ messageCount: 0 });
      manager.findOne.mockResolvedValue(session);
      manager.save
        .mockResolvedValueOnce({
          id: 'msg-1',
          sessionId: 'session-1',
          seq: 1,
          senderUserId: 'customer-1',
          senderRole: SupportMessageSenderRole.CUSTOMER,
          content: 'Hi',
          createdAt: new Date(),
        })
        .mockResolvedValueOnce({ ...session, messageCount: 1 });

      const result = await service.sendMessage(
        'session-1',
        'customer-1',
        [Role.Customer],
        { content: 'Hi' },
      );

      expect(result.seq).toBe(1);
      expect(result.senderRole).toBe(SupportMessageSenderRole.CUSTOMER);
    });
  });
});
