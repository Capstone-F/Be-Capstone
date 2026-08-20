import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';
import {
  AdminClinicResponseDto,
  PaginatedAdminClinicsDto,
} from './dto/clinic-commission.dto';
import {
  ClinicResponseDto,
  PaginatedClinicsDto,
} from './dto/clinic-response.dto';
import { CreateClinicDto } from './dto/create-clinic.dto';
import { ListAdminClinicsQueryDto } from './dto/list-admin-clinics-query.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';
import { UpdateClinicDto } from './dto/update-clinic.dto';

@Injectable()
export class ClinicsService {
  constructor(
    @InjectRepository(Clinic)
    private readonly clinicRepository: Repository<Clinic>,
  ) {}

  async findById(id: string): Promise<Clinic | null> {
    return this.clinicRepository.findOneBy({ id });
  }

  async requireById(id: string): Promise<Clinic> {
    const clinic = await this.findById(id);
    if (!clinic) {
      throw new NotFoundException(`Không tìm thấy phòng khám ${id}`);
    }
    return clinic;
  }

  async findMany(query: ListClinicsQueryDto): Promise<PaginatedClinicsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const [clinics, total] = await this.clinicRepository.findAndCount({
      where: { isActive: true },
      order: { name: 'ASC' },
      skip,
      take: limit,
    });

    return {
      items: clinics.map((clinic) => this.toResponse(clinic)),
      total,
      page,
      limit,
    };
  }

  async adminFindMany(
    query: ListAdminClinicsQueryDto,
  ): Promise<PaginatedAdminClinicsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.clinicRepository
      .createQueryBuilder('clinic')
      .orderBy('clinic.name', 'ASC')
      .skip(skip)
      .take(limit);

    if (query.activeOnly === true) {
      qb.andWhere('clinic.isActive = :isActive', { isActive: true });
    }

    const q = query.q?.trim();
    if (q) {
      qb.andWhere('LOWER(clinic.name) LIKE LOWER(:q)', { q: `%${q}%` });
    }

    const [clinics, total] = await qb.getManyAndCount();

    return {
      items: clinics.map((clinic) => this.toAdminResponse(clinic)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<ClinicResponseDto> {
    const clinic = await this.requireById(id);
    return this.toResponse(clinic);
  }

  async adminFindOne(id: string): Promise<AdminClinicResponseDto> {
    return this.toAdminResponse(await this.requireById(id));
  }

  async create(dto: CreateClinicDto): Promise<AdminClinicResponseDto> {
    const clinic = await this.clinicRepository.save(
      this.clinicRepository.create({
        name: dto.name.trim(),
        address: this.normalizeNullableString(dto.address),
        latitude: this.normalizeNullableNumber(dto.latitude),
        longitude: this.normalizeNullableNumber(dto.longitude),
        isActive: dto.isActive ?? true,
        commissionRatePct: '10',
      }),
    );
    return this.toAdminResponse(clinic);
  }

  async updateBankAccount(
    clinicId: string,
    dto: {
      bankName: string;
      bankAccountNumber: string;
      bankAccountHolder: string;
    },
  ): Promise<ClinicResponseDto> {
    const clinic = await this.requireById(clinicId);
    clinic.bankName = dto.bankName.trim();
    clinic.bankAccountNumber = dto.bankAccountNumber.trim();
    clinic.bankAccountHolder = dto.bankAccountHolder.trim();
    const saved = await this.clinicRepository.save(clinic);
    return this.toResponse(saved);
  }

  async update(
    id: string,
    dto: UpdateClinicDto,
  ): Promise<AdminClinicResponseDto> {
    const clinic = await this.requireById(id);

    if (dto.name !== undefined) {
      clinic.name = dto.name.trim();
    }
    if (dto.address !== undefined) {
      clinic.address = this.normalizeNullableString(dto.address);
    }
    if (dto.latitude !== undefined) {
      clinic.latitude = this.normalizeNullableNumber(dto.latitude);
    }
    if (dto.longitude !== undefined) {
      clinic.longitude = this.normalizeNullableNumber(dto.longitude);
    }
    if (dto.isActive !== undefined) {
      clinic.isActive = dto.isActive;
    }

    const saved = await this.clinicRepository.save(clinic);
    return this.toAdminResponse(saved);
  }

  async updateCommission(
    id: string,
    percent: number,
  ): Promise<AdminClinicResponseDto> {
    const clinic = await this.requireById(id);
    clinic.commissionRatePct = String(percent);
    return this.toAdminResponse(await this.clinicRepository.save(clinic));
  }

  async deactivate(id: string): Promise<AdminClinicResponseDto> {
    const clinic = await this.requireById(id);
    clinic.isActive = false;
    const saved = await this.clinicRepository.save(clinic);
    return this.toAdminResponse(saved);
  }

  private normalizeNullableString(
    value: string | null | undefined,
  ): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private normalizeNullableNumber(
    value: number | null | undefined,
  ): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    return value;
  }

  private toResponse(clinic: Clinic): ClinicResponseDto {
    return {
      id: clinic.id,
      name: clinic.name,
      address: clinic.address,
      latitude:
        clinic.latitude === null || clinic.latitude === undefined
          ? null
          : Number(clinic.latitude),
      longitude:
        clinic.longitude === null || clinic.longitude === undefined
          ? null
          : Number(clinic.longitude),
      isActive: clinic.isActive,
      bankName: clinic.bankName ?? null,
      bankAccountNumber: clinic.bankAccountNumber ?? null,
      bankAccountHolder: clinic.bankAccountHolder ?? null,
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
    };
  }

  private toAdminResponse(clinic: Clinic): AdminClinicResponseDto {
    return {
      ...this.toResponse(clinic),
      commissionPercent: Number(clinic.commissionRatePct ?? 10),
    };
  }
}
