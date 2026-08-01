import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { hasAnyRole, Role } from '../auth/roles.enum';
import { Expert } from '../users/expert.entity';
import { CallerContext } from '../users/users.service';
import { CreateExpertAvailabilityDto } from './dto/create-expert-availability.dto';
import {
  ExpertAvailabilityListDto,
  ExpertAvailabilityResponseDto,
} from './dto/expert-availability-response.dto';
import { UpdateExpertAvailabilityDto } from './dto/update-expert-availability.dto';
import { ExpertAvailability } from './expert-availability.entity';

@Injectable()
export class ExpertAvailabilityService {
  constructor(
    @InjectRepository(Expert)
    private readonly expertRepository: Repository<Expert>,
    @InjectRepository(ExpertAvailability)
    private readonly availabilityRepository: Repository<ExpertAvailability>,
  ) {}

  async list(
    caller: CallerContext,
    expertId: string,
  ): Promise<ExpertAvailabilityListDto> {
    await this.requireAccessibleExpert(caller, expertId);
    const rows = await this.availabilityRepository.find({
      where: { expertId },
      order: { dayOfWeek: 'ASC', startHour: 'ASC' },
    });
    return { items: rows.map((row) => this.toResponse(row)) };
  }

  async create(
    caller: CallerContext,
    expertId: string,
    dto: CreateExpertAvailabilityDto,
  ): Promise<ExpertAvailabilityResponseDto> {
    await this.requireAccessibleExpert(caller, expertId);
    this.assertValidWindow(dto.startHour, dto.endHour);
    await this.assertNoOverlap(
      expertId,
      dto.dayOfWeek,
      dto.startHour,
      dto.endHour,
    );

    const row = this.availabilityRepository.create({
      expertId,
      dayOfWeek: dto.dayOfWeek,
      startHour: dto.startHour,
      endHour: dto.endHour,
    });
    const saved = await this.availabilityRepository.save(row);
    return this.toResponse(saved);
  }

  async update(
    caller: CallerContext,
    expertId: string,
    id: string,
    dto: UpdateExpertAvailabilityDto,
  ): Promise<ExpertAvailabilityResponseDto> {
    await this.requireAccessibleExpert(caller, expertId);
    const row = await this.requireAvailability(expertId, id);

    const dayOfWeek = dto.dayOfWeek ?? row.dayOfWeek;
    const startHour = dto.startHour ?? row.startHour;
    const endHour = dto.endHour ?? row.endHour;
    this.assertValidWindow(startHour, endHour);
    await this.assertNoOverlap(expertId, dayOfWeek, startHour, endHour, row.id);

    row.dayOfWeek = dayOfWeek;
    row.startHour = startHour;
    row.endHour = endHour;
    const saved = await this.availabilityRepository.save(row);
    return this.toResponse(saved);
  }

  async remove(
    caller: CallerContext,
    expertId: string,
    id: string,
  ): Promise<void> {
    await this.requireAccessibleExpert(caller, expertId);
    const row = await this.requireAvailability(expertId, id);
    await this.availabilityRepository.remove(row);
  }

  private async requireAccessibleExpert(
    caller: CallerContext,
    expertId: string,
  ): Promise<Expert> {
    const expert = await this.expertRepository.findOne({
      where: { id: expertId },
    });
    if (!expert) {
      throw new NotFoundException(`Expert ${expertId} not found`);
    }
    this.assertCallerCanManageAvailability(caller, expert);
    return expert;
  }

  private async requireAvailability(
    expertId: string,
    id: string,
  ): Promise<ExpertAvailability> {
    const row = await this.availabilityRepository.findOne({
      where: { id, expertId },
    });
    if (!row) {
      throw new NotFoundException(
        `Availability ${id} not found for expert ${expertId}`,
      );
    }
    return row;
  }

  private assertCallerCanManageAvailability(
    caller: CallerContext,
    expert: Expert,
  ): void {
    if (hasAnyRole(caller.roles, [Role.AppAdmin])) {
      return;
    }

    if (hasAnyRole(caller.roles, [Role.ClinicManager])) {
      if (!caller.clinicId || expert.clinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Clinic manager can only manage availability for experts in their clinic',
        );
      }
      return;
    }

    if (hasAnyRole(caller.roles, [Role.Expert])) {
      if (expert.userId !== caller.userId) {
        throw new ForbiddenException(
          'Experts can only manage their own availability',
        );
      }
      return;
    }

    throw new ForbiddenException(
      'Insufficient permissions to manage expert availability',
    );
  }

  private assertValidWindow(startHour: number, endHour: number): void {
    if (endHour <= startHour) {
      throw new BadRequestException('endHour must be greater than startHour');
    }
  }

  private async assertNoOverlap(
    expertId: string,
    dayOfWeek: number,
    startHour: number,
    endHour: number,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.availabilityRepository.find({
      where: excludeId
        ? { expertId, dayOfWeek, id: Not(excludeId) }
        : { expertId, dayOfWeek },
    });

    const overlaps = existing.some(
      (block) => startHour < block.endHour && block.startHour < endHour,
    );
    if (overlaps) {
      throw new ConflictException(
        'Availability block overlaps an existing block on the same day',
      );
    }
  }

  private toResponse(row: ExpertAvailability): ExpertAvailabilityResponseDto {
    return {
      id: row.id,
      expertId: row.expertId,
      dayOfWeek: row.dayOfWeek,
      startHour: row.startHour,
      endHour: row.endHour,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
