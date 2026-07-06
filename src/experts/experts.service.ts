import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expert } from '../users/expert.entity';
import { ListExpertsQueryDto } from './dto/list-experts.dto';
import {
  ExpertResponseDto,
  PaginatedExpertsDto,
} from './dto/expert-response.dto';
import { haversineKm } from './haversine.util';

@Injectable()
export class ExpertsService {
  constructor(
    @InjectRepository(Expert)
    private readonly expertRepository: Repository<Expert>,
  ) {}

  async findMany(query: ListExpertsQueryDto): Promise<PaginatedExpertsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const hasLat = query.lat !== undefined && query.lat !== null;
    const hasLng = query.lng !== undefined && query.lng !== null;

    if (hasLat !== hasLng) {
      throw new BadRequestException(
        'Both lat and lng must be provided for distance filtering',
      );
    }

    const qb = this.buildBaseQuery(query);

    if (hasLat && hasLng) {
      const experts = await qb.getMany();
      const withDistance = experts.map((expert) => {
        const distanceKm = this.computeDistanceKm(
          query.lat!,
          query.lng!,
          expert,
        );
        return { expert, distanceKm };
      });

      let filtered = withDistance;
      if (query.radiusKm !== undefined && query.radiusKm !== null) {
        filtered = withDistance.filter(
          (item) =>
            item.distanceKm !== null && item.distanceKm <= query.radiusKm!,
        );
      }

      filtered.sort((a, b) => {
        if (a.distanceKm === null && b.distanceKm === null) {
          return 0;
        }
        if (a.distanceKm === null) {
          return 1;
        }
        if (b.distanceKm === null) {
          return -1;
        }
        return a.distanceKm - b.distanceKm;
      });

      const total = filtered.length;
      const skip = (page - 1) * limit;
      const items = filtered
        .slice(skip, skip + limit)
        .map(({ expert, distanceKm }) => this.toResponse(expert, distanceKm));

      return { items, total, page, limit };
    }

    qb.orderBy('expert.rating', 'DESC');
    const skip = (page - 1) * limit;
    qb.skip(skip).take(limit);

    const [experts, total] = await qb.getManyAndCount();
    const items = experts.map((expert) => this.toResponse(expert, null));

    return { items, total, page, limit };
  }

  async findOne(id: string): Promise<ExpertResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { id },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(`Expert ${id} not found`);
    }
    return this.toResponse(expert, null);
  }

  private buildBaseQuery(query: ListExpertsQueryDto) {
    const qb = this.expertRepository
      .createQueryBuilder('expert')
      .leftJoinAndSelect('expert.user', 'user')
      .leftJoinAndSelect('expert.clinic', 'clinic')
      .where('expert.isActive = :isActive', { isActive: true });

    if (query.specialization) {
      qb.andWhere('expert.specialization = :specialization', {
        specialization: query.specialization,
      });
    }

    if (query.minRating !== undefined && query.minRating !== null) {
      qb.andWhere('expert.rating >= :minRating', {
        minRating: query.minRating,
      });
    }

    if (query.minFee !== undefined && query.minFee !== null) {
      qb.andWhere('expert.consultationFee >= :minFee', {
        minFee: query.minFee,
      });
    }

    if (query.maxFee !== undefined && query.maxFee !== null) {
      qb.andWhere('expert.consultationFee <= :maxFee', {
        maxFee: query.maxFee,
      });
    }

    return qb;
  }

  private computeDistanceKm(
    clientLat: number,
    clientLng: number,
    expert: Expert,
  ): number | null {
    const clinic = expert.clinic;
    if (
      !clinic ||
      clinic.latitude === null ||
      clinic.latitude === undefined ||
      clinic.longitude === null ||
      clinic.longitude === undefined
    ) {
      return null;
    }
    return haversineKm(
      clientLat,
      clientLng,
      Number(clinic.latitude),
      Number(clinic.longitude),
    );
  }

  private toResponse(
    expert: Expert,
    distanceKm: number | null,
  ): ExpertResponseDto {
    return {
      id: expert.id,
      name: expert.user?.name ?? null,
      email: expert.user?.email ?? null,
      clinicId: expert.clinicId,
      clinicName: expert.clinic?.name ?? null,
      specialization: expert.specialization,
      licenseNumber: expert.licenseNumber,
      bio: expert.bio,
      rating: Number(expert.rating),
      consultationFee: Number(expert.consultationFee),
      distanceKm,
      isActive: expert.isActive,
      createdAt: expert.createdAt,
      updatedAt: expert.updatedAt,
    };
  }
}
