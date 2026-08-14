import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Between,
  DataSource,
  FindOptionsWhere,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Role } from '../auth/roles.enum';
import { LedgerAccount, TransactionType } from '../commerce/enums';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import {
  BookingAutoCancelReason,
  BookingCancelledBy,
  ConsultationStatus,
} from '../consultations/enums';
import { Feedback } from '../consultations/feedback.entity';
import { EscrowService } from '../finance/escrow.service';
import { TreatmentStatus } from '../treatments/enums';
import { Treatment } from '../treatments/treatment.entity';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { WalletService } from '../wallet/wallet.service';
import { BookingPerspective, BookingRange, BookingTab } from './enums';
import {
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingFeedbackDto } from './dto/create-booking-feedback.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ListClinicBookingsQueryDto } from './dto/list-clinic-bookings-query.dto';
import {
  ClinicBookingResponseDto,
  PaginatedClinicBookingsDto,
} from './dto/clinic-booking-response.dto';
import { ListSlotsQueryDto } from './dto/list-slots-query.dto';
import {
  AvailableSlotsResponseDto,
  DaySlotsDto,
  SlotDto,
} from './dto/slot-response.dto';
import { ExpertAvailability } from './expert-availability.entity';
import {
  BUSINESS_END_HOUR,
  BUSINESS_START_HOUR,
  clampToBusinessHours,
  dateAtHour,
  enumerateDates,
  formatVnIso,
  generateSlotsForBlock,
  getMonthRange,
  getWeekRange,
  slotsOverlap,
  TimeWindow,
  todayVn,
  vnCalendarDate,
  vnDayOfWeek,
} from './slot-generation.util';

const ACTIVE_BOOKING_STATUSES = [
  ConsultationStatus.PENDING,
  ConsultationStatus.CONFIRMED,
  ConsultationStatus.IN_PROGRESS,
];

const CANCELLABLE_STATUSES = [
  ConsultationStatus.PENDING,
  ConsultationStatus.CONFIRMED,
];

/** Cancel copy written by the expiry sweep, keyed by auto-cancel reason. */
const AUTO_CANCEL_REASON_TEXT: Record<BookingAutoCancelReason, string> = {
  [BookingAutoCancelReason.CONFIRM_TIMEOUT]:
    'Tự động hủy: chuyên gia không xác nhận lịch hẹn trong thời gian quy định',
  [BookingAutoCancelReason.EXPERT_NO_SHOW]:
    'Tự động hủy: chuyên gia không bắt đầu buổi tư vấn đúng giờ',
};

/** Status an auto-cancel may transition from, per reason. */
const AUTO_CANCEL_FROM_STATUS: Record<
  BookingAutoCancelReason,
  ConsultationStatus
> = {
  [BookingAutoCancelReason.CONFIRM_TIMEOUT]: ConsultationStatus.PENDING,
  [BookingAutoCancelReason.EXPERT_NO_SHOW]: ConsultationStatus.CONFIRMED,
};

const BOOKING_DETAIL_RELATIONS = [
  'customer',
  'customer.user',
  'expert',
  'expert.user',
  'expert.clinic',
  'feedback',
] as const;

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Expert)
    private readonly expertRepository: Repository<Expert>,
    @InjectRepository(ExpertAvailability)
    private readonly availabilityRepository: Repository<ExpertAvailability>,
    @InjectRepository(ConsultationRequest)
    private readonly consultationRepository: Repository<ConsultationRequest>,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    @InjectRepository(Treatment)
    private readonly treatmentRepository: Repository<Treatment>,
    private readonly walletService: WalletService,
    private readonly escrowService: EscrowService,
    private readonly dataSource: DataSource,
  ) {}

  async createBooking(
    userId: string,
    dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { id: dto.expertId, isActive: true },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(`Không tìm thấy chuyên gia ${dto.expertId}`);
    }
    this.assertExpertHasClinic(expert);

    const scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    this.assertFutureTopOfHour(scheduledAt);
    await this.assertSlotIsBookable(expert, scheduledAt);

    const customer = await this.getOrCreateCustomerByUserId(userId);
    const followUp = await this.findActivePaidTreatmentForFollowUp(
      customer.id,
      expert.id,
    );

    const consultation = this.consultationRepository.create({
      customerId: customer.id,
      expertId: expert.id,
      reason: dto.reason?.trim() ?? null,
      status: ConsultationStatus.PENDING,
      scheduledAt,
      isFollowUp: !!followUp,
      treatmentId: followUp?.id ?? null,
      feeChargedVnd: followUp ? '0' : null,
      paidTransactionId: null,
    });
    const saved = await this.consultationRepository.save(consultation);

    return this.toBookingResponse(saved, customer, expert);
  }

  async payBooking(
    userId: string,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const consultation = await this.requireBooking(bookingId);
    const customerUserId = consultation.customer?.userId;
    if (!customerUserId || customerUserId !== userId) {
      throw new ForbiddenException(
        'Chỉ khách hàng sở hữu mới có thể thanh toán',
      );
    }
    if (consultation.status !== ConsultationStatus.PENDING) {
      throw new BadRequestException(
        `Lịch hẹn chỉ có thể thanh toán khi đang ở trạng thái PENDING (hiện tại: ${consultation.status})`,
      );
    }
    if (this.isBookingPaid(consultation)) {
      throw new BadRequestException('Lịch hẹn đã được thanh toán');
    }
    if (consultation.isFollowUp) {
      consultation.feeChargedVnd = '0';
      const saved = await this.consultationRepository.save(consultation);
      return this.toBookingResponseFromSaved(saved, consultation);
    }

    const expert =
      consultation.expert ??
      (await this.expertRepository.findOneOrFail({
        where: { id: consultation.expertId },
      }));
    const fee = Math.round(Number(expert.consultationFee));
    if (!Number.isFinite(fee) || fee <= 0) {
      throw new BadRequestException(
        'Phí tư vấn của chuyên gia không thể thanh toán',
      );
    }
    if (!expert.clinicId) {
      throw new BadRequestException('Chuyên gia chưa được gắn với phòng khám');
    }

    await this.dataSource.transaction(async (manager) => {
      const tx = await this.walletService.debitWithManager(manager, {
        type: TransactionType.CONSULTATION_PAYMENT,
        amountVnd: fee,
        userId,
        consultationId: consultation.id,
        clinicId: expert.clinicId,
        expertId: expert.id,
        fromAccount: LedgerAccount.CUSTOMER_WALLET,
        toAccount: LedgerAccount.PLATFORM_ESCROW,
        externalRef: `consultation-pay:${consultation.id}`,
        note: `Consultation fee for booking ${consultation.id}`,
      });

      await this.escrowService.holdConsultationWithManager(manager, {
        consultationId: consultation.id,
        clinicId: expert.clinicId,
        expertId: expert.id,
        customerUserId: userId,
        amountVnd: fee,
        holdTransactionId: tx.id,
      });

      consultation.feeChargedVnd = String(fee);
      consultation.paidTransactionId = tx.id;
      await manager.save(ConsultationRequest, consultation);
    });

    const saved = await this.requireBooking(bookingId);
    return this.toBookingResponseFromSaved(saved, saved, expert);
  }

  async confirmBooking(
    userId: string,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const expert = await this.requireExpertByUserId(
      userId,
      'Cần hồ sơ chuyên gia để xác nhận lịch hẹn',
    );
    const consultation = await this.requireBooking(bookingId);
    this.assertAssignedExpert(consultation, expert);

    if (consultation.status !== ConsultationStatus.PENDING) {
      throw new BadRequestException(
        `Lịch hẹn chỉ có thể được xác nhận từ trạng thái PENDING (hiện tại: ${consultation.status})`,
      );
    }
    if (!this.isBookingPaid(consultation)) {
      throw new BadRequestException(
        'Lịch hẹn phải được thanh toán (hoặc là lịch tái khám miễn phí) trước khi xác nhận',
      );
    }

    consultation.status = ConsultationStatus.CONFIRMED;
    const saved = await this.consultationRepository.save(consultation);
    return this.toBookingResponseFromSaved(saved, consultation, expert);
  }

  async cancelBooking(
    userId: string,
    roles: Role[],
    bookingId: string,
    dto: CancelBookingDto,
  ): Promise<BookingResponseDto> {
    const consultation = await this.requireBooking(bookingId);
    const cancelledBy = await this.resolveCancelActor(
      userId,
      roles,
      consultation,
    );

    if (!CANCELLABLE_STATUSES.includes(consultation.status)) {
      throw new BadRequestException(
        `Lịch hẹn chỉ có thể được hủy từ trạng thái PENDING hoặc CONFIRMED (hiện tại: ${consultation.status})`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const hold = await this.escrowService.findByConsultation(
        manager,
        consultation.id,
      );
      if (hold) {
        await this.escrowService.refundWithManager(manager, hold.id);
      }

      consultation.status = ConsultationStatus.CANCELLED;
      consultation.cancelledAt = new Date();
      consultation.cancelReason = dto.reason?.trim() || null;
      consultation.cancelledBy = cancelledBy;
      consultation.autoCancelReason = null;
      await manager.save(ConsultationRequest, consultation);
    });

    const saved = await this.requireBooking(bookingId);
    return this.toBookingResponseFromSaved(saved, saved);
  }

  /**
   * Cron-driven cancel: refunds any escrow hold and stamps SYSTEM cancel
   * metadata. The status transition is a conditional UPDATE, so a racing manual
   * cancel / confirm / start wins and this returns false without refunding.
   */
  async autoCancelBooking(
    bookingId: string,
    reason: BookingAutoCancelReason,
  ): Promise<boolean> {
    const fromStatus = AUTO_CANCEL_FROM_STATUS[reason];

    return this.dataSource.transaction(async (manager) => {
      const claimed = await manager.update(
        ConsultationRequest,
        { id: bookingId, status: fromStatus },
        {
          status: ConsultationStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelReason: AUTO_CANCEL_REASON_TEXT[reason],
          cancelledBy: BookingCancelledBy.SYSTEM,
          autoCancelReason: reason,
        },
      );
      if (!claimed.affected) {
        return false;
      }

      const hold = await this.escrowService.findHeldByConsultation(
        manager,
        bookingId,
      );
      if (hold) {
        await this.escrowService.refundWithManager(manager, hold.id);
      }
      return true;
    });
  }

  async startBooking(
    userId: string,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const expert = await this.requireExpertByUserId(
      userId,
      'Cần hồ sơ chuyên gia để bắt đầu lịch hẹn',
    );
    const consultation = await this.requireBooking(bookingId);
    this.assertAssignedExpert(consultation, expert);

    if (consultation.status !== ConsultationStatus.CONFIRMED) {
      throw new BadRequestException(
        `Lịch hẹn chỉ có thể được bắt đầu từ trạng thái CONFIRMED (hiện tại: ${consultation.status})`,
      );
    }

    consultation.status = ConsultationStatus.IN_PROGRESS;
    consultation.startedAt = new Date();
    const saved = await this.consultationRepository.save(consultation);
    return this.toBookingResponseFromSaved(saved, consultation, expert);
  }

  async completeBooking(
    userId: string,
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const expert = await this.requireExpertByUserId(
      userId,
      'Cần hồ sơ chuyên gia để hoàn thành lịch hẹn',
    );
    const consultation = await this.requireBooking(bookingId);
    this.assertAssignedExpert(consultation, expert);

    if (consultation.status !== ConsultationStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Lịch hẹn chỉ có thể được hoàn thành từ trạng thái IN_PROGRESS (hiện tại: ${consultation.status})`,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const hold = await this.escrowService.findHeldByConsultation(
        manager,
        consultation.id,
      );
      if (hold) {
        await this.escrowService.releaseWithManager(manager, hold.id);
      }

      consultation.status = ConsultationStatus.COMPLETED;
      consultation.completedAt = new Date();
      await manager.save(ConsultationRequest, consultation);
    });

    const saved = await this.requireBooking(bookingId);
    return this.toBookingResponseFromSaved(saved, saved, expert);
  }

  async submitFeedback(
    userId: string,
    bookingId: string,
    dto: CreateBookingFeedbackDto,
  ): Promise<BookingResponseDto> {
    const consultation = await this.requireBooking(bookingId);

    const customerUserId = consultation.customer?.userId;
    if (!customerUserId || customerUserId !== userId) {
      throw new ForbiddenException(
        'Chỉ khách hàng sở hữu mới có thể gửi phản hồi',
      );
    }

    if (!this.isFeedbackAllowed(consultation)) {
      throw new BadRequestException(
        `Phản hồi chỉ có thể được gửi cho lịch hẹn đã COMPLETED hoặc bị hủy do chuyên gia không bắt đầu buổi tư vấn (hiện tại: ${consultation.status})`,
      );
    }

    if (consultation.feedback) {
      throw new ConflictException('Phản hồi đã được gửi cho lịch hẹn này');
    }

    const existing = await this.feedbackRepository.findOne({
      where: { consultationId: bookingId },
    });
    if (existing) {
      throw new ConflictException('Phản hồi đã được gửi cho lịch hẹn này');
    }

    const feedback = this.feedbackRepository.create({
      consultationId: consultation.id,
      rating: dto.rating,
      comment: dto.comment?.trim() || null,
    });
    await this.feedbackRepository.save(feedback);
    await this.refreshExpertRating(consultation.expertId);

    const reloaded = await this.requireBooking(bookingId);
    return this.toBookingResponse(reloaded, reloaded.customer, reloaded.expert);
  }

  async getMyBooking(
    userId: string,
    roles: Role[],
    bookingId: string,
  ): Promise<BookingResponseDto> {
    const consultation = await this.requireBooking(bookingId);
    const isOwnerCustomer =
      roles.includes(Role.Customer) && consultation.customer?.userId === userId;
    const isAssignedExpert =
      roles.includes(Role.Expert) && consultation.expert?.userId === userId;

    if (!isOwnerCustomer && !isAssignedExpert) {
      throw new ForbiddenException('Bạn không có quyền truy cập lịch hẹn này');
    }

    return this.toBookingResponse(
      consultation,
      consultation.customer,
      consultation.expert,
    );
  }

  /**
   * List bookings across all experts in a clinic (clinic manager oversight).
   * Read-only; scoped by joining through the expert's clinic. Enriches each row
   * with the escrow hold status so managers can see when funds release.
   */
  async findByClinic(
    clinicId: string,
    query: ListClinicBookingsQueryDto,
  ): Promise<PaginatedClinicBookingsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.consultationRepository
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.expert', 'expert')
      .leftJoinAndSelect('expert.user', 'expertUser')
      .leftJoinAndSelect('expert.clinic', 'clinic')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('customer.user', 'customerUser')
      .leftJoinAndSelect('c.feedback', 'feedback')
      .where('expert.clinicId = :clinicId', { clinicId });

    if (query.expertId) {
      qb.andWhere('c.expertId = :expertId', { expertId: query.expertId });
    }
    if (query.status) {
      qb.andWhere('c.status = :status', { status: query.status });
    }

    const searchTerm = query.search?.trim() || query.q?.trim();
    if (searchTerm) {
      const searchPattern = `%${searchTerm.toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(customerUser.name) LIKE :searchPattern OR LOWER(expertUser.name) LIKE :searchPattern OR LOWER(c.id) LIKE :searchPattern)',
        { searchPattern },
      );
    }

    if (query.from && query.to) {
      qb.andWhere('c.scheduledAt BETWEEN :from AND :to', {
        from: new Date(query.from),
        to: new Date(query.to),
      });
    } else if (query.from) {
      qb.andWhere('c.scheduledAt >= :from', { from: new Date(query.from) });
    } else if (query.to) {
      qb.andWhere('c.scheduledAt <= :to', { to: new Date(query.to) });
    }

    qb.orderBy('c.scheduledAt', 'DESC')
      .addOrderBy('c.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [consultations, total] = await qb.getManyAndCount();

    const statusMap = await this.escrowService.getStatusByConsultationIds(
      consultations.map((c) => c.id),
    );

    const items = consultations.map((c) => ({
      ...this.toBookingResponse(c, c.customer, c.expert),
      escrowStatus: statusMap.get(c.id) ?? null,
    }));

    return { items, total, page, limit };
  }

  /** Single booking detail for a clinic manager, scoped to their clinic. */
  async getClinicBooking(
    clinicId: string,
    bookingId: string,
  ): Promise<ClinicBookingResponseDto> {
    const consultation = await this.consultationRepository.findOne({
      where: { id: bookingId },
      relations: [
        'expert',
        'expert.user',
        'expert.clinic',
        'customer',
        'customer.user',
        'feedback',
      ],
    });
    if (!consultation) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn ${bookingId}`);
    }
    if (consultation.expert?.clinicId !== clinicId) {
      throw new ForbiddenException(
        'Lịch hẹn này không thuộc phòng khám của bạn',
      );
    }

    const statusMap = await this.escrowService.getStatusByConsultationIds([
      consultation.id,
    ]);

    return {
      ...this.toBookingResponse(
        consultation,
        consultation.customer,
        consultation.expert,
      ),
      escrowStatus: statusMap.get(consultation.id) ?? null,
    };
  }

  async listMyBookings(
    userId: string,
    roles: Role[],
    query: ListBookingsQueryDto,
  ): Promise<PaginatedBookingsDto> {
    if (query.tab && query.status) {
      throw new BadRequestException(
        'Chỉ sử dụng bộ lọc tab hoặc trạng thái, không dùng cả hai',
      );
    }

    const perspective = this.resolvePerspective(roles, query.as);
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;
    const relations = [
      'expert',
      'expert.user',
      'expert.clinic',
      'customer',
      'customer.user',
      'feedback',
    ];

    if (perspective === BookingPerspective.CUSTOMER) {
      const customer = await this.customerRepository.findOne({
        where: { userId },
        relations: ['user'],
      });
      if (!customer) {
        return { items: [], total: 0, page, limit };
      }

      const where = this.buildBookingWhere({ customerId: customer.id }, query);

      const [consultations, total] =
        await this.consultationRepository.findAndCount({
          where,
          relations,
          order: { scheduledAt: 'DESC', createdAt: 'DESC' },
          skip,
          take: limit,
        });

      return {
        items: consultations.map((c) =>
          this.toBookingResponse(c, c.customer ?? customer, c.expert),
        ),
        total,
        page,
        limit,
      };
    }

    const expert = await this.expertRepository.findOne({
      where: { userId },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      return { items: [], total: 0, page, limit };
    }

    const where = this.buildBookingWhere({ expertId: expert.id }, query);

    const [consultations, total] =
      await this.consultationRepository.findAndCount({
        where,
        relations,
        order: { scheduledAt: 'DESC', createdAt: 'DESC' },
        skip,
        take: limit,
      });

    return {
      items: consultations.map((c) =>
        this.toBookingResponse(c, c.customer, c.expert ?? expert),
      ),
      total,
      page,
      limit,
    };
  }

  async getAvailableSlots(
    expertId: string,
    query: ListSlotsQueryDto,
  ): Promise<AvailableSlotsResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { id: expertId, isActive: true },
    });
    if (!expert) {
      throw new NotFoundException(`Không tìm thấy chuyên gia ${expertId}`);
    }
    this.assertExpertHasClinic(expert);

    const anchorDate = query.date ? this.parseDateOnly(query.date) : todayVn();
    const range = query.range ?? BookingRange.WEEK;
    const { from, to } =
      range === BookingRange.MONTH
        ? getMonthRange(anchorDate)
        : getWeekRange(anchorDate);

    const sessionLengthHours = expert.sessionLengthHours;
    const availability = await this.availabilityRepository.find({
      where: { expertId },
    });
    // No configured windows → open business hours every day (GMT+7 09–20).
    const openAllHours = availability.length === 0;

    const availabilityByDay = new Map<number, ExpertAvailability[]>();
    for (const row of availability) {
      const existing = availabilityByDay.get(row.dayOfWeek) ?? [];
      existing.push(row);
      availabilityByDay.set(row.dayOfWeek, existing);
    }

    const bookedWindows = await this.loadBookedWindows(
      expertId,
      from,
      to,
      sessionLengthHours,
    );

    const days: DaySlotsDto[] = [];
    for (const date of enumerateDates(from, to)) {
      const blocks = openAllHours
        ? [{ startHour: BUSINESS_START_HOUR, endHour: BUSINESS_END_HOUR }]
        : (availabilityByDay.get(date.getUTCDay()) ?? []);
      const candidateSlots: TimeWindow[] = [];

      for (const block of blocks) {
        const clamped = clampToBusinessHours(block.startHour, block.endHour);
        if (!clamped) {
          continue;
        }
        candidateSlots.push(
          ...generateSlotsForBlock(
            date,
            clamped.startHour,
            clamped.endHour,
            sessionLengthHours,
          ),
        );
      }

      candidateSlots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

      const slots: SlotDto[] = candidateSlots.map((slot) => ({
        startAt: formatVnIso(slot.startAt),
        endAt: formatVnIso(slot.endAt),
        available: !bookedWindows.some((booked) => slotsOverlap(slot, booked)),
      }));

      days.push({
        date: this.formatDateOnly(date),
        slots,
      });
    }

    return {
      expertId,
      sessionLengthHours,
      range,
      from: this.formatDateOnly(from),
      to: this.formatDateOnly(to),
      days,
    };
  }

  private async assertSlotIsBookable(
    expert: Expert,
    scheduledAt: Date,
  ): Promise<void> {
    const sessionLengthHours = expert.sessionLengthHours;
    const calendarDate = vnCalendarDate(scheduledAt);
    const dayOfWeek = vnDayOfWeek(scheduledAt);

    const allBlocks = await this.availabilityRepository.find({
      where: { expertId: expert.id },
    });
    // No configured windows → open business hours (GMT+7 09–20).
    const blocks =
      allBlocks.length === 0
        ? [{ startHour: BUSINESS_START_HOUR, endHour: BUSINESS_END_HOUR }]
        : allBlocks.filter((block) => block.dayOfWeek === dayOfWeek);

    const candidateSlots: TimeWindow[] = [];
    for (const block of blocks) {
      const clamped = clampToBusinessHours(block.startHour, block.endHour);
      if (!clamped) {
        continue;
      }
      candidateSlots.push(
        ...generateSlotsForBlock(
          calendarDate,
          clamped.startHour,
          clamped.endHour,
          sessionLengthHours,
        ),
      );
    }

    const matchesAvailability = candidateSlots.some(
      (slot) => slot.startAt.getTime() === scheduledAt.getTime(),
    );
    if (!matchesAvailability) {
      throw new BadRequestException(
        'scheduledAt nằm ngoài khung lịch trống của chuyên gia',
      );
    }

    const matched = candidateSlots.find(
      (slot) => slot.startAt.getTime() === scheduledAt.getTime(),
    )!;
    const requestedWindow: TimeWindow = {
      startAt: scheduledAt,
      endAt: matched.endAt,
    };

    const overlapping = await this.consultationRepository.find({
      where: {
        expertId: expert.id,
        status: In(ACTIVE_BOOKING_STATUSES),
      },
    });

    const hasConflict = overlapping
      .filter((b) => b.scheduledAt !== null)
      .some((b) => {
        const bookedStart = b.scheduledAt!;
        const bookedEnd = new Date(bookedStart);
        bookedEnd.setUTCHours(bookedEnd.getUTCHours() + sessionLengthHours);
        return slotsOverlap(requestedWindow, {
          startAt: bookedStart,
          endAt: bookedEnd,
        });
      });

    if (hasConflict) {
      throw new ConflictException('Khung giờ yêu cầu đã được đặt');
    }
  }

  private async getOrCreateCustomerByUserId(userId: string): Promise<Customer> {
    const existing = await this.customerRepository.findOne({
      where: { userId },
      relations: ['user'],
    });
    if (existing) {
      return existing;
    }

    const created = this.customerRepository.create({ userId });
    const saved = await this.customerRepository.save(created);
    return this.customerRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['user'],
    });
  }

  private resolvePerspective(
    roles: Role[],
    requested?: BookingPerspective,
  ): BookingPerspective {
    const hasCustomer = roles.includes(Role.Customer);
    const hasExpert = roles.includes(Role.Expert);

    if (requested) {
      if (requested === BookingPerspective.CUSTOMER && !hasCustomer) {
        throw new ForbiddenException(
          'Không đủ quyền để xem danh sách lịch hẹn với vai trò khách hàng',
        );
      }
      if (requested === BookingPerspective.EXPERT && !hasExpert) {
        throw new ForbiddenException(
          'Không đủ quyền để xem danh sách lịch hẹn với vai trò chuyên gia',
        );
      }
      return requested;
    }

    if (hasCustomer) {
      return BookingPerspective.CUSTOMER;
    }
    if (hasExpert) {
      return BookingPerspective.EXPERT;
    }

    throw new ForbiddenException('Không đủ quyền để xem danh sách lịch hẹn');
  }

  private assertExpertHasClinic(expert: Expert): void {
    if (!expert.clinicId) {
      throw new BadRequestException(
        'Chuyên gia chưa được liên kết với phòng khám và không thể đặt lịch',
      );
    }
  }

  private parseScheduledAt(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        'scheduledAt phải là ngày hợp lệ theo chuẩn ISO 8601',
      );
    }
    return date;
  }

  private assertFutureTopOfHour(scheduledAt: Date): void {
    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BadRequestException('scheduledAt phải ở trong tương lai');
    }
    // GMT+7 is a fixed offset, so VN top-of-hour == UTC top-of-hour.
    if (
      scheduledAt.getUTCMinutes() !== 0 ||
      scheduledAt.getUTCSeconds() !== 0 ||
      scheduledAt.getUTCMilliseconds() !== 0
    ) {
      throw new BadRequestException(
        'scheduledAt phải được căn theo đầu giờ (GMT+7)',
      );
    }
  }

  private buildBookingWhere(
    base: FindOptionsWhere<ConsultationRequest>,
    query: ListBookingsQueryDto,
  ): FindOptionsWhere<ConsultationRequest> {
    const where: FindOptionsWhere<ConsultationRequest> = { ...base };

    if (query.tab === BookingTab.UPCOMING) {
      where.status = In([
        ConsultationStatus.PENDING,
        ConsultationStatus.CONFIRMED,
        ConsultationStatus.IN_PROGRESS,
      ]);
      where.scheduledAt = MoreThanOrEqual(new Date());
      return where;
    }

    if (query.tab === BookingTab.PAST) {
      where.status = ConsultationStatus.COMPLETED;
      return where;
    }

    if (query.tab === BookingTab.CANCELLED) {
      where.status = ConsultationStatus.CANCELLED;
      return where;
    }

    if (query.status) {
      where.status = query.status;
    }

    return where;
  }

  private async refreshExpertRating(expertId: string): Promise<void> {
    const result = await this.feedbackRepository
      .createQueryBuilder('f')
      .innerJoin('f.consultation', 'c')
      .select('AVG(f.rating)', 'avg')
      .where('c.expertId = :expertId', { expertId })
      .getRawOne<{ avg: string | null }>();

    const avg =
      result?.avg != null && result.avg !== ''
        ? Number(Number(result.avg).toFixed(2))
        : 0;

    await this.expertRepository.update({ id: expertId }, { rating: avg });
  }

  private async requireBooking(
    bookingId: string,
  ): Promise<ConsultationRequest> {
    const consultation = await this.consultationRepository.findOne({
      where: { id: bookingId },
      relations: [...BOOKING_DETAIL_RELATIONS],
    });
    if (!consultation) {
      throw new NotFoundException(`Không tìm thấy lịch hẹn ${bookingId}`);
    }
    return consultation;
  }

  private async requireExpertByUserId(
    userId: string,
    message: string,
  ): Promise<Expert> {
    const expert = await this.expertRepository.findOne({
      where: { userId },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new ForbiddenException(message);
    }
    return expert;
  }

  private assertAssignedExpert(
    consultation: ConsultationRequest,
    expert: Expert,
  ): void {
    if (consultation.expertId !== expert.id) {
      throw new ForbiddenException(
        'Bạn chỉ có thể quản lý lịch hẹn của chính mình',
      );
    }
  }

  private async resolveCancelActor(
    userId: string,
    roles: Role[],
    consultation: ConsultationRequest,
  ): Promise<BookingCancelledBy> {
    const hasCustomer = roles.includes(Role.Customer);
    const hasExpert = roles.includes(Role.Expert);

    if (hasExpert) {
      const expertUserId =
        consultation.expert?.userId ??
        (
          await this.expertRepository.findOne({
            where: { id: consultation.expertId },
          })
        )?.userId;
      if (expertUserId === userId) {
        return BookingCancelledBy.EXPERT;
      }
    }

    if (hasCustomer) {
      const customerUserId =
        consultation.customer?.userId ??
        (
          await this.customerRepository.findOne({
            where: { id: consultation.customerId },
          })
        )?.userId;
      if (customerUserId === userId) {
        return BookingCancelledBy.CUSTOMER;
      }
    }

    throw new ForbiddenException(
      'Chỉ khách hàng sở hữu hoặc chuyên gia được phân công mới có thể hủy lịch hẹn này',
    );
  }

  private toBookingResponseFromSaved(
    saved: ConsultationRequest,
    loaded: ConsultationRequest,
    expertFallback?: Expert | null,
  ): BookingResponseDto {
    return this.toBookingResponse(
      saved,
      saved.customer ?? loaded.customer,
      saved.expert ?? loaded.expert ?? expertFallback,
    );
  }

  private toBookingResponse(
    consultation: ConsultationRequest,
    customer?: Customer | null,
    expert?: Expert | null,
  ): BookingResponseDto {
    const clinic = expert?.clinic;
    return {
      id: consultation.id,
      customerId: consultation.customerId,
      expertId: consultation.expertId,
      expertName: expert?.user?.name ?? null,
      expertSpecialization: expert?.specialization ?? null,
      clinic: clinic
        ? {
            id: clinic.id,
            name: clinic.name,
            address: clinic.address ?? '',
          }
        : expert?.clinicId
          ? {
              id: expert.clinicId,
              name: '',
              address: '',
            }
          : null,
      customerName: customer?.user?.name ?? null,
      reason: consultation.reason,
      status: consultation.status,
      scheduledAt:
        consultation.scheduledAt != null
          ? formatVnIso(consultation.scheduledAt)
          : null,
      startedAt: consultation.startedAt,
      completedAt: consultation.completedAt,
      cancelledAt: consultation.cancelledAt ?? null,
      cancelReason: consultation.cancelReason ?? null,
      cancelledBy: consultation.cancelledBy ?? null,
      autoCancelReason: consultation.autoCancelReason ?? null,
      canSubmitFeedback:
        this.isFeedbackAllowed(consultation) && !consultation.feedback,
      treatmentId: consultation.treatmentId ?? null,
      feeChargedVnd: consultation.feeChargedVnd ?? null,
      paidTransactionId: consultation.paidTransactionId ?? null,
      isFollowUp: consultation.isFollowUp ?? false,
      isPaid: this.isBookingPaid(consultation),
      feedback: consultation.feedback
        ? {
            rating: consultation.feedback.rating,
            comment: consultation.feedback.comment,
          }
        : null,
      createdAt: consultation.createdAt,
      updatedAt: consultation.updatedAt,
    };
  }

  /**
   * Feedback is normally post-COMPLETED, but an expert no-show is also
   * rateable — the customer lost the slot and the expert rating should reflect it.
   */
  private isFeedbackAllowed(consultation: ConsultationRequest): boolean {
    if (consultation.status === ConsultationStatus.COMPLETED) {
      return true;
    }
    return (
      consultation.status === ConsultationStatus.CANCELLED &&
      consultation.autoCancelReason === BookingAutoCancelReason.EXPERT_NO_SHOW
    );
  }

  private isBookingPaid(consultation: ConsultationRequest): boolean {
    if (consultation.isFollowUp) {
      return true;
    }
    return (
      consultation.paidTransactionId != null &&
      Number(consultation.feeChargedVnd ?? 0) > 0
    );
  }

  private async findActivePaidTreatmentForFollowUp(
    customerId: string,
    expertId: string,
  ): Promise<Treatment | null> {
    const today = this.formatDateOnly(todayVn());
    return this.treatmentRepository
      .createQueryBuilder('t')
      .where('t.customerId = :customerId', { customerId })
      .andWhere('t.expertId = :expertId', { expertId })
      .andWhere('t.status = :status', { status: TreatmentStatus.ACTIVE })
      .andWhere('t.paidAt IS NOT NULL')
      .andWhere('t.startDate IS NOT NULL')
      .andWhere('t.endDate IS NOT NULL')
      .andWhere('t.startDate <= :today', { today })
      .andWhere('t.endDate >= :today')
      .orderBy('t.paidAt', 'DESC')
      .getOne();
  }

  private async loadBookedWindows(
    expertId: string,
    from: Date,
    to: Date,
    sessionLengthHours: number,
  ): Promise<TimeWindow[]> {
    // Expand calendar markers to absolute GMT+7 day bounds for the query.
    const rangeStart = dateAtHour(from, 0);
    const rangeEnd = dateAtHour(to, 24);

    const bookings = await this.consultationRepository.find({
      where: {
        expertId,
        status: In(ACTIVE_BOOKING_STATUSES),
        scheduledAt: Between(rangeStart, rangeEnd),
      },
    });

    return bookings
      .filter((b) => b.scheduledAt !== null)
      .map((b) => {
        const startAt = b.scheduledAt!;
        const endAt = new Date(startAt);
        endAt.setUTCHours(endAt.getUTCHours() + sessionLengthHours);
        return { startAt, endAt };
      });
  }

  /** Parse YYYY-MM-DD as a Vietnam calendar date-only marker. */
  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private formatDateOnly(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
