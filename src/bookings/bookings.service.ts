import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import { ConsultationRequest } from '../consultations/consultation-request.entity';
import { ConsultationStatus } from '../consultations/enums';
import { Expert } from '../users/expert.entity';
import { BookingRange } from './enums';
import { ListSlotsQueryDto } from './dto/list-slots-query.dto';
import {
  AvailableSlotsResponseDto,
  DaySlotsDto,
  SlotDto,
} from './dto/slot-response.dto';
import { ExpertAvailability } from './expert-availability.entity';
import {
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
  ) {}

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
