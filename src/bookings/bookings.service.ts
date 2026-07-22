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
  FindOptionsWhere,
  In,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Role } from '../auth/roles.enum';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus } from '../consultations/enums';
import { Customer } from '../users/customer.entity';
import { Expert } from '../users/expert.entity';
import { BookingPerspective, BookingRange, BookingTab } from './enums';
import {
  BookingResponseDto,
  PaginatedBookingsDto,
} from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListBookingsQueryDto } from './dto/list-bookings-query.dto';
import { ListSlotsQueryDto } from './dto/list-slots-query.dto';
import {
  AvailableSlotsResponseDto,
  DaySlotsDto,
  SlotDto,
} from './dto/slot-response.dto';
import { ExpertAvailability } from './expert-availability.entity';
import {
  dateAtHour,
  enumerateDates,
  generateSlotsForBlock,
  getMonthRange,
  getWeekRange,
  slotsOverlap,
  TimeWindow,
} from './slot-generation.util';

const ACTIVE_BOOKING_STATUSES = [
  ConsultationStatus.PENDING,
  ConsultationStatus.CONFIRMED,
  ConsultationStatus.IN_PROGRESS,
];

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
      throw new NotFoundException(`Expert ${dto.expertId} not found`);
    }
    this.assertExpertHasClinic(expert);

    const scheduledAt = this.parseScheduledAt(dto.scheduledAt);
    this.assertFutureTopOfHour(scheduledAt);
    await this.assertSlotIsBookable(expert, scheduledAt);

    const customer = await this.getOrCreateCustomerByUserId(userId);

    const consultation = this.consultationRepository.create({
      customerId: customer.id,
      expertId: expert.id,
      reason: dto.reason?.trim() ?? null,
      status: ConsultationStatus.PENDING,
      scheduledAt,
    });
    const saved = await this.consultationRepository.save(consultation);

    return this.toBookingResponse(saved, customer, expert);
  }

  async listMyBookings(
    userId: string,
    roles: Role[],
    query: ListBookingsQueryDto,
  ): Promise<PaginatedBookingsDto> {
    if (query.tab && query.status) {
      throw new BadRequestException(
        'Use either tab or status filter, not both',
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
      throw new NotFoundException(`Expert ${expertId} not found`);
    }
    this.assertExpertHasClinic(expert);

    const anchorDate = query.date
      ? this.parseDateOnly(query.date)
      : this.todayUtc();
    const range = query.range ?? BookingRange.WEEK;
    const { from, to } =
      range === BookingRange.MONTH
        ? getMonthRange(anchorDate)
        : getWeekRange(anchorDate);

    const sessionLengthHours = expert.sessionLengthHours;
    const availability = await this.availabilityRepository.find({
      where: { expertId },
    });

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
      const blocks = availabilityByDay.get(date.getUTCDay()) ?? [];
      const candidateSlots: TimeWindow[] = [];

      for (const block of blocks) {
        candidateSlots.push(
          ...generateSlotsForBlock(
            date,
            block.startHour,
            block.endHour,
            sessionLengthHours,
          ),
        );
      }

      candidateSlots.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());

      const slots: SlotDto[] = candidateSlots.map((slot) => ({
        startAt: slot.startAt,
        endAt: slot.endAt,
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
    const calendarDate = new Date(
      Date.UTC(
        scheduledAt.getUTCFullYear(),
        scheduledAt.getUTCMonth(),
        scheduledAt.getUTCDate(),
      ),
    );
    const dayOfWeek = scheduledAt.getUTCDay();
    const startHour = scheduledAt.getUTCHours();

    const blocks = await this.availabilityRepository.find({
      where: { expertId: expert.id, dayOfWeek },
    });

    const candidateSlots: TimeWindow[] = [];
    for (const block of blocks) {
      candidateSlots.push(
        ...generateSlotsForBlock(
          calendarDate,
          block.startHour,
          block.endHour,
          sessionLengthHours,
        ),
      );
    }

    const matchesAvailability = candidateSlots.some(
      (slot) => slot.startAt.getTime() === scheduledAt.getTime(),
    );
    if (!matchesAvailability) {
      throw new BadRequestException(
        'scheduledAt is outside the expert availability window',
      );
    }

    const endAt = dateAtHour(calendarDate, startHour + sessionLengthHours);
    const requestedWindow: TimeWindow = { startAt: scheduledAt, endAt };

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
      throw new ConflictException('The requested slot is already booked');
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
          'Insufficient permissions to list bookings as customer',
        );
      }
      if (requested === BookingPerspective.EXPERT && !hasExpert) {
        throw new ForbiddenException(
          'Insufficient permissions to list bookings as expert',
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

    throw new ForbiddenException('Insufficient permissions to list bookings');
  }

  private assertExpertHasClinic(expert: Expert): void {
    if (!expert.clinicId) {
      throw new BadRequestException(
        'Expert is not linked to a clinic and cannot be booked',
      );
    }
  }

  private parseScheduledAt(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(
        'scheduledAt must be a valid ISO 8601 date',
      );
    }
    return date;
  }

  private assertFutureTopOfHour(scheduledAt: Date): void {
    const now = new Date();
    if (scheduledAt.getTime() <= now.getTime()) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    if (
      scheduledAt.getUTCMinutes() !== 0 ||
      scheduledAt.getUTCSeconds() !== 0 ||
      scheduledAt.getUTCMilliseconds() !== 0
    ) {
      throw new BadRequestException(
        'scheduledAt must be aligned to the top of the hour (UTC)',
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
      scheduledAt: consultation.scheduledAt,
      startedAt: consultation.startedAt,
      completedAt: consultation.completedAt,
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

  private async loadBookedWindows(
    expertId: string,
    from: Date,
    to: Date,
    sessionLengthHours: number,
  ): Promise<TimeWindow[]> {
    const bookings = await this.consultationRepository.find({
      where: {
        expertId,
        status: In(ACTIVE_BOOKING_STATUSES),
        scheduledAt: Between(from, to),
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

  private parseDateOnly(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
  }

  private todayUtc(): Date {
    const now = new Date();
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
  }

  private formatDateOnly(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
