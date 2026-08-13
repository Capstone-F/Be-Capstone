import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { hasAnyRole, Role } from '../auth/roles.enum';
import { CloseSupportSessionDto } from './dto/close-support-session.dto';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import { ListSupportMessagesQueryDto } from './dto/list-support-messages-query.dto';
import { ListSupportSessionsQueryDto } from './dto/list-support-sessions-query.dto';
import { MarkSupportReadDto } from './dto/mark-support-read.dto';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import {
  SupportMessageResponseDto,
  SupportMessagesPageDto,
} from './dto/support-message-response.dto';
import {
  PaginatedSupportSessionsDto,
  SupportSessionResponseDto,
} from './dto/support-session-response.dto';
import {
  SupportMessageSenderRole,
  SupportSessionAssignedFilter,
  SupportSessionStatus,
} from './enums';
import { SupportMessage } from './support-message.entity';
import { SupportSession } from './support-session.entity';

const PREVIEW_MAX_LENGTH = 200;
const LIVE_STATUSES = [SupportSessionStatus.OPEN, SupportSessionStatus.ACTIVE];

type ParticipantRole = SupportMessageSenderRole;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class SupportService {
  constructor(
    @InjectRepository(SupportSession)
    private readonly sessionRepository: Repository<SupportSession>,
    @InjectRepository(SupportMessage)
    private readonly messageRepository: Repository<SupportMessage>,
  ) {}

  async create(
    customerUserId: string,
    dto: CreateSupportSessionDto,
  ): Promise<SupportSessionResponseDto> {
    const existing = await this.sessionRepository.findOne({
      where: {
        customerUserId,
        status: In(LIVE_STATUSES),
      },
      relations: ['customerUser', 'assignedStaffUser'],
    });
    if (existing) {
      return this.toSessionResponse(existing);
    }

    const session = this.sessionRepository.create({
      customerUserId,
      status: SupportSessionStatus.OPEN,
      subject: dto.subject?.trim() || null,
      messageCount: 0,
      customerLastReadSeq: 0,
      staffLastReadSeq: 0,
    });

    try {
      const saved = await this.sessionRepository.save(session);
      return this.toSessionResponse(await this.loadSessionOrFail(saved.id));
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const winner = await this.sessionRepository.findOne({
        where: {
          customerUserId,
          status: In(LIVE_STATUSES),
        },
        relations: ['customerUser', 'assignedStaffUser'],
      });
      if (!winner) {
        throw error;
      }
      return this.toSessionResponse(winner);
    }
  }

  async getMyLiveSession(
    customerUserId: string,
  ): Promise<SupportSessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: {
        customerUserId,
        status: In(LIVE_STATUSES),
      },
      relations: ['customerUser', 'assignedStaffUser'],
    });
    if (!session) {
      throw new NotFoundException('No live support session found');
    }
    return this.toSessionResponse(session);
  }

  async listForStaff(
    staffUserId: string,
    query: ListSupportSessionsQueryDto,
  ): Promise<PaginatedSupportSessionsDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const qb = this.sessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.customerUser', 'customerUser')
      .leftJoinAndSelect('session.assignedStaffUser', 'assignedStaffUser')
      .orderBy('session.lastMessageAt', 'DESC', 'NULLS LAST')
      .addOrderBy('session.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      qb.andWhere('session.status = :status', { status: query.status });
    }

    const assigned = query.assigned ?? SupportSessionAssignedFilter.Any;
    if (assigned === SupportSessionAssignedFilter.Me) {
      qb.andWhere('session.assignedStaffUserId = :staffUserId', {
        staffUserId,
      });
    } else if (assigned === SupportSessionAssignedFilter.Unassigned) {
      qb.andWhere('session.assignedStaffUserId IS NULL');
    }

    const [items, total] = await qb.getManyAndCount();
    return {
      items: items.map((session) => this.toSessionResponse(session)),
      total,
      page,
      limit,
    };
  }

  async getById(
    id: string,
    userId: string,
    roles: string[],
  ): Promise<SupportSessionResponseDto> {
    const session = await this.loadSessionOrFail(id);
    this.assertCanViewSession(session, userId, roles);
    return this.toSessionResponse(session);
  }

  async claim(
    staffUserId: string,
    id: string,
  ): Promise<SupportSessionResponseDto> {
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(SupportSession)
      .set({
        status: SupportSessionStatus.ACTIVE,
        assignedStaffUserId: staffUserId,
        assignedAt: new Date(),
      })
      .where('id = :id AND status = :open AND "assignedStaffUserId" IS NULL', {
        id,
        open: SupportSessionStatus.OPEN,
      })
      .execute();

    if (!result.affected) {
      const session = await this.sessionRepository.findOne({ where: { id } });
      if (!session) {
        throw new NotFoundException(`Support session ${id} not found`);
      }
      if (session.assignedStaffUserId === staffUserId) {
        return this.toSessionResponse(await this.loadSessionOrFail(id));
      }
      throw new ConflictException(
        `Support session ${id} is already handled by another staff`,
      );
    }

    return this.toSessionResponse(await this.loadSessionOrFail(id));
  }

  async sendMessage(
    id: string,
    userId: string,
    roles: string[],
    dto: SendSupportMessageDto,
  ): Promise<SupportMessageResponseDto> {
    const content = dto.content.trim();
    if (!content) {
      throw new BadRequestException('Message content cannot be empty');
    }

    return this.sessionRepository.manager.transaction(async (manager) => {
      const session = await manager.findOne(SupportSession, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) {
        throw new NotFoundException(`Support session ${id} not found`);
      }
      if (session.status === SupportSessionStatus.CLOSED) {
        throw new ConflictException(
          `Support session ${id} is closed and cannot accept messages`,
        );
      }

      const participantRole = this.assertCanSendMessage(session, userId, roles);

      const seq = session.messageCount + 1;
      const message = manager.create(SupportMessage, {
        sessionId: session.id,
        seq,
        senderUserId: userId,
        senderRole: participantRole,
        content,
        metadata: dto.metadata,
      });

      session.messageCount = seq;
      session.lastMessageAt = new Date();
      session.lastMessagePreview = content.slice(0, PREVIEW_MAX_LENGTH);

      const savedMessage = await manager.save(SupportMessage, message);
      await manager.save(SupportSession, session);

      return this.toMessageResponse(savedMessage);
    });
  }

  async listMessages(
    id: string,
    userId: string,
    roles: string[],
    query: ListSupportMessagesQueryDto,
  ): Promise<SupportMessagesPageDto> {
    const session = await this.loadSessionOrFail(id);
    this.assertCanViewSession(session, userId, roles);

    const afterSeq = query.afterSeq ?? 0;
    const limit = query.limit ?? 50;

    const items = await this.messageRepository
      .createQueryBuilder('message')
      .where('message.sessionId = :id', { id })
      .andWhere('message.seq > :afterSeq', { afterSeq })
      .orderBy('message.seq', 'ASC')
      .take(limit + 1)
      .getMany();

    const hasMore = items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const lastSeq =
      pageItems.length > 0 ? pageItems[pageItems.length - 1].seq : afterSeq;

    return {
      items: pageItems.map((message) => this.toMessageResponse(message)),
      lastSeq,
      hasMore,
    };
  }

  async markRead(
    id: string,
    userId: string,
    roles: string[],
    dto: MarkSupportReadDto,
  ): Promise<SupportSessionResponseDto> {
    const session = await this.loadSessionOrFail(id);
    const participantRole = this.assertParticipant(session, userId, roles);

    if (dto.lastReadSeq > session.messageCount) {
      throw new BadRequestException(
        `lastReadSeq ${dto.lastReadSeq} exceeds messageCount ${session.messageCount}`,
      );
    }

    if (participantRole === SupportMessageSenderRole.CUSTOMER) {
      if (dto.lastReadSeq > session.customerLastReadSeq) {
        session.customerLastReadSeq = dto.lastReadSeq;
      }
    } else if (dto.lastReadSeq > session.staffLastReadSeq) {
      session.staffLastReadSeq = dto.lastReadSeq;
    }

    const saved = await this.sessionRepository.save(session);
    return this.toSessionResponse(await this.loadSessionOrFail(saved.id));
  }

  async close(
    id: string,
    userId: string,
    roles: string[],
    dto: CloseSupportSessionDto,
  ): Promise<SupportSessionResponseDto> {
    const session = await this.loadSessionOrFail(id);
    this.assertCanCloseSession(session, userId, roles);

    if (session.status === SupportSessionStatus.CLOSED) {
      return this.toSessionResponse(session);
    }

    session.status = SupportSessionStatus.CLOSED;
    session.closedByUserId = userId;
    session.closedAt = new Date();
    session.closeReason = dto.reason?.trim() || null;

    const saved = await this.sessionRepository.save(session);
    return this.toSessionResponse(await this.loadSessionOrFail(saved.id));
  }

  private async loadSessionOrFail(id: string): Promise<SupportSession> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['customerUser', 'assignedStaffUser'],
    });
    if (!session) {
      throw new NotFoundException(`Support session ${id} not found`);
    }
    return session;
  }

  private assertCanViewSession(
    session: SupportSession,
    userId: string,
    roles: string[],
  ): void {
    if (hasAnyRole(roles, [Role.AppAdmin])) {
      return;
    }
    if (session.customerUserId === userId) {
      return;
    }
    if (hasAnyRole(roles, [Role.Staff])) {
      // Staff may view any session in the shared queue (read for claim/detail).
      return;
    }
    throw new ForbiddenException(
      'You are not allowed to view this support session',
    );
  }

  private assertParticipant(
    session: SupportSession,
    userId: string,
    roles: string[],
  ): ParticipantRole {
    if (session.customerUserId === userId) {
      return SupportMessageSenderRole.CUSTOMER;
    }
    if (
      session.assignedStaffUserId === userId &&
      hasAnyRole(roles, [Role.Staff, Role.AppAdmin])
    ) {
      return SupportMessageSenderRole.STAFF;
    }
    throw new ForbiddenException(
      'You are not a participant of this support session',
    );
  }

  private assertCanSendMessage(
    session: SupportSession,
    userId: string,
    roles: string[],
  ): ParticipantRole {
    if (session.customerUserId === userId) {
      return SupportMessageSenderRole.CUSTOMER;
    }
    if (
      hasAnyRole(roles, [Role.Staff, Role.AppAdmin]) &&
      session.assignedStaffUserId === userId
    ) {
      return SupportMessageSenderRole.STAFF;
    }
    if (hasAnyRole(roles, [Role.Staff, Role.AppAdmin])) {
      throw new ForbiddenException(
        'Only the assigned staff can send messages in this support session',
      );
    }
    throw new ForbiddenException(
      'You are not allowed to send messages in this support session',
    );
  }

  private assertCanCloseSession(
    session: SupportSession,
    userId: string,
    roles: string[],
  ): void {
    if (hasAnyRole(roles, [Role.AppAdmin])) {
      return;
    }
    if (session.customerUserId === userId) {
      return;
    }
    if (
      session.assignedStaffUserId === userId &&
      hasAnyRole(roles, [Role.Staff])
    ) {
      return;
    }
    throw new ForbiddenException(
      'Only the customer, assigned staff, or app admin can close this session',
    );
  }

  private toSessionResponse(
    session: SupportSession,
  ): SupportSessionResponseDto {
    return {
      id: session.id,
      customerUserId: session.customerUserId,
      customerName: session.customerUser?.name ?? null,
      status: session.status,
      subject: session.subject,
      assignedStaffUserId: session.assignedStaffUserId,
      assignedStaffName: session.assignedStaffUser?.name ?? null,
      assignedAt: session.assignedAt,
      messageCount: session.messageCount,
      customerLastReadSeq: session.customerLastReadSeq,
      staffLastReadSeq: session.staffLastReadSeq,
      lastMessageAt: session.lastMessageAt,
      lastMessagePreview: session.lastMessagePreview,
      closedByUserId: session.closedByUserId,
      closedAt: session.closedAt,
      closeReason: session.closeReason,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toMessageResponse(
    message: SupportMessage,
  ): SupportMessageResponseDto {
    return {
      id: message.id,
      sessionId: message.sessionId,
      seq: message.seq,
      senderUserId: message.senderUserId,
      senderRole: message.senderRole,
      content: message.content,
      metadata: message.metadata ?? null,
      createdAt: message.createdAt,
    };
  }
}
