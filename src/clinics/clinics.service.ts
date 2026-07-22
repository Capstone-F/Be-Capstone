import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Clinic } from './clinic.entity';
import {
  ClinicResponseDto,
  PaginatedClinicsDto,
} from './dto/clinic-response.dto';
import { ListClinicsQueryDto } from './dto/list-clinics-query.dto';

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
      throw new NotFoundException(`Clinic ${id} not found`);
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

  async findOne(id: string): Promise<ClinicResponseDto> {
    const clinic = await this.requireById(id);
    return this.toResponse(clinic);
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
      createdAt: clinic.createdAt,
      updatedAt: clinic.updatedAt,
    };
  }
}
