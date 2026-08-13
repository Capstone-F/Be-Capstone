import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, hasAnyRole } from '../auth/roles.enum';
import { ClinicsService } from '../clinics/clinics.service';
import { Feedback } from '../consultations/feedback.entity';
import { Expert } from '../users/expert.entity';
import { User } from '../users/user.entity';
import { CallerContext } from '../users/users.service';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
import { ListExpertsQueryDto } from './dto/list-experts.dto';
import { ListClinicExpertsQueryDto } from './dto/list-clinic-experts.dto';
import { ListExpertFeedbacksQueryDto } from './dto/list-expert-feedbacks.dto';
import {
  ExpertFeedbackItemDto,
  PaginatedExpertFeedbacksDto,
} from './dto/expert-feedback-response.dto';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Feedback)
    private readonly feedbackRepository: Repository<Feedback>,
    private readonly clinicsService: ClinicsService,
  ) {}

  async findMany(query: ListExpertsQueryDto): Promise<PaginatedExpertsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    const hasLat = query.lat !== undefined && query.lat !== null;
    const hasLng = query.lng !== undefined && query.lng !== null;

    if (hasLat !== hasLng) {
      throw new BadRequestException(
        'Cần cung cấp cả lat và lng để lọc theo khoảng cách',
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
    const expert = await this.requireExpert(id);
    return this.toResponse(expert, null);
  }

  /**
   * List experts in a clinic for its manager, including deactivated ones.
   * Unlike {@link findMany} (the public directory), this is not restricted to
   * active experts and always scopes to the manager's own clinic.
   */
  async findByClinicForManager(
    clinicId: string,
    query: ListClinicExpertsQueryDto,
  ): Promise<PaginatedExpertsDto> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.expertRepository
      .createQueryBuilder('expert')
      .innerJoinAndSelect('expert.user', 'user')
      .leftJoinAndSelect('expert.clinic', 'clinic')
      .where('expert.clinicId = :clinicId', { clinicId });

    if (query.specialization) {
      qb.andWhere('expert.specialization = :specialization', {
        specialization: query.specialization,
      });
    }
    if (query.isActive !== undefined) {
      qb.andWhere('expert.isActive = :isActive', { isActive: query.isActive });
    }

    qb.orderBy('expert.isActive', 'DESC')
      .addOrderBy('user.name', 'ASC')
      .skip(skip)
      .take(limit);

    const [experts, total] = await qb.getManyAndCount();
    const items = experts.map((expert) => this.toResponse(expert, null));

    return { items, total, page, limit };
  }

  async findFeedbacksByExpertId(
    expertId: string,
    query: ListExpertFeedbacksQueryDto,
  ): Promise<PaginatedExpertFeedbacksDto> {
    await this.requireExpert(expertId);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.feedbackRepository
      .createQueryBuilder('f')
      .innerJoinAndSelect('f.consultation', 'c')
      .leftJoinAndSelect('c.customer', 'customer')
      .leftJoinAndSelect('customer.user', 'customerUser')
      .where('c.expertId = :expertId', { expertId })
      .orderBy('f.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    const [feedbacks, total] = await qb.getManyAndCount();

    const agg = await this.feedbackRepository
      .createQueryBuilder('f')
      .innerJoin('f.consultation', 'c')
      .select('AVG(f.rating)', 'avg')
      .addSelect('COUNT(f.id)', 'count')
      .where('c.expertId = :expertId', { expertId })
      .getRawOne<{ avg: string | null; count: string }>();

    const ratingCount = Number(agg?.count ?? 0);
    const averageRating =
      agg?.avg != null && agg.avg !== ''
        ? Number(Number(agg.avg).toFixed(2))
        : 0;

    const items = feedbacks.map((feedback) => this.toFeedbackItem(feedback));

    return {
      items,
      total,
      page,
      limit,
      averageRating,
      ratingCount,
    };
  }

  async getOwnProfile(userId: string): Promise<ExpertResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { userId },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ chuyên gia cho người dùng hiện tại',
      );
    }
    return this.toResponse(expert, null);
  }

  async create(
    caller: CallerContext,
    dto: CreateExpertDto,
  ): Promise<ExpertResponseDto> {
    this.assertCanManageExperts(caller);

    if (!dto.clinicId?.trim()) {
      throw new BadRequestException('clinicId là bắt buộc');
    }

    const clinicId = this.resolveClinicIdForCaller(caller, dto.clinicId);
    await this.clinicsService.requireById(clinicId);

    const user = await this.userRepository.findOneBy({ id: dto.userId });
    if (!user) {
      throw new NotFoundException(`Không tìm thấy người dùng ${dto.userId}`);
    }
    if (!user.roles?.includes(Role.Expert)) {
      throw new BadRequestException(
        'userId phải thuộc về người dùng có vai trò chuyên gia',
      );
    }
    this.assertCallerCanAccessUserClinic(caller, user);

    const existing = await this.expertRepository.findOneBy({
      userId: dto.userId,
    });
    if (existing) {
      throw new ConflictException(
        `Hồ sơ chuyên gia đã tồn tại cho người dùng ${dto.userId}`,
      );
    }

    const isActive = dto.isActive ?? true;
    if (isActive && !clinicId) {
      throw new BadRequestException(
        'clinicId là bắt buộc để kích hoạt chuyên gia',
      );
    }

    const expert = this.expertRepository.create({
      userId: dto.userId,
      clinicId,
      specialization: dto.specialization,
      licenseNumber: dto.licenseNumber?.trim() || null,
      bio: dto.bio?.trim() || null,
      avatarUrl: dto.avatarUrl?.trim() || null,
      consultationFee: dto.consultationFee ?? 0,
      sessionLengthHours: dto.sessionLengthHours ?? 1,
      isActive,
    });
    const saved = await this.expertRepository.save(expert);

    user.clinicId = clinicId;
    await this.userRepository.save(user);

    const reloaded = await this.requireExpert(saved.id);
    return this.toResponse(reloaded, null);
  }

  async update(
    caller: CallerContext,
    id: string,
    dto: UpdateExpertDto,
  ): Promise<ExpertResponseDto> {
    this.assertCanManageExperts(caller);

    const expert = await this.requireExpert(id);
    this.assertCallerCanAccessExpert(caller, expert);

    if (dto.clinicId !== undefined) {
      if (!dto.clinicId?.trim()) {
        throw new BadRequestException('clinicId không thể bị xóa');
      }
      const clinicId = this.resolveClinicIdForCaller(caller, dto.clinicId);
      const clinic = await this.clinicsService.requireById(clinicId);
      expert.clinicId = clinic.id;
      expert.clinic = clinic;
    }

    if (dto.specialization !== undefined) {
      expert.specialization = dto.specialization;
    }
    if (dto.licenseNumber !== undefined) {
      expert.licenseNumber = dto.licenseNumber?.trim() || null;
    }
    if (dto.bio !== undefined) {
      expert.bio = dto.bio?.trim() || null;
    }
    if (dto.avatarUrl !== undefined) {
      expert.avatarUrl = dto.avatarUrl?.trim() || null;
    }
    if (dto.consultationFee !== undefined) {
      expert.consultationFee = dto.consultationFee;
    }
    if (dto.sessionLengthHours !== undefined) {
      expert.sessionLengthHours = dto.sessionLengthHours;
    }
    if (dto.isActive !== undefined) {
      if (dto.isActive === true && !expert.clinicId) {
        throw new BadRequestException(
          'clinicId là bắt buộc để kích hoạt chuyên gia',
        );
      }
      expert.isActive = dto.isActive;
    }

    await this.expertRepository.save(expert);

    if (expert.clinicId) {
      await this.userRepository.update(
        { id: expert.userId },
        { clinicId: expert.clinicId },
      );
    }

    const reloaded = await this.requireExpert(id);
    return this.toResponse(reloaded, null);
  }

  async updateOwnAvatar(
    userId: string,
    avatarUrl: string,
  ): Promise<ExpertResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { userId },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ chuyên gia cho người dùng hiện tại',
      );
    }

    expert.avatarUrl = avatarUrl.trim();
    await this.expertRepository.save(expert);

    const reloaded = await this.requireExpert(expert.id);
    return this.toResponse(reloaded, null);
  }

  async upsertOwnConsultationFee(
    userId: string,
    consultationFee: number,
  ): Promise<ExpertResponseDto> {
    const expert = await this.expertRepository.findOne({
      where: { userId },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(
        'Không tìm thấy hồ sơ chuyên gia cho người dùng hiện tại',
      );
    }

    expert.consultationFee = consultationFee;
    await this.expertRepository.save(expert);

    const reloaded = await this.requireExpert(expert.id);
    return this.toResponse(reloaded, null);
  }

  async upsertConsultationFee(
    caller: CallerContext,
    expertId: string,
    consultationFee: number,
  ): Promise<ExpertResponseDto> {
    const expert = await this.requireExpert(expertId);
    this.assertCallerCanManageConsultationFee(caller, expert);

    expert.consultationFee = consultationFee;
    await this.expertRepository.save(expert);

    const reloaded = await this.requireExpert(expertId);
    return this.toResponse(reloaded, null);
  }

  private async requireExpert(id: string): Promise<Expert> {
    const expert = await this.expertRepository.findOne({
      where: { id },
      relations: ['user', 'clinic'],
    });
    if (!expert) {
      throw new NotFoundException(`Không tìm thấy chuyên gia ${id}`);
    }
    return expert;
  }

  private assertCanManageExperts(caller: CallerContext): void {
    if (!hasAnyRole(caller.roles, [Role.AppAdmin, Role.ClinicManager])) {
      throw new ForbiddenException(
        'Không đủ quyền để quản lý hồ sơ chuyên gia',
      );
    }
  }

  private resolveClinicIdForCaller(
    caller: CallerContext,
    requestedClinicId: string,
  ): string {
    if (caller.roles.includes(Role.ClinicManager)) {
      if (!caller.clinicId) {
        throw new ForbiddenException(
          'Người quản lý phòng khám chưa được gắn với phòng khám',
        );
      }
      if (requestedClinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Người quản lý phòng khám chỉ có thể quản lý các chuyên gia trong phòng khám của mình',
        );
      }
      return caller.clinicId;
    }
    return requestedClinicId;
  }

  private assertCallerCanAccessUserClinic(
    caller: CallerContext,
    user: User,
  ): void {
    if (hasAnyRole(caller.roles, [Role.AppAdmin])) {
      return;
    }
    if (caller.roles.includes(Role.ClinicManager)) {
      if (!caller.clinicId || user.clinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Người quản lý phòng khám chỉ có thể quản lý các chuyên gia trong phòng khám của mình',
        );
      }
    }
  }

  private assertCallerCanAccessExpert(
    caller: CallerContext,
    expert: Expert,
  ): void {
    if (hasAnyRole(caller.roles, [Role.AppAdmin])) {
      return;
    }
    if (caller.roles.includes(Role.ClinicManager)) {
      if (!caller.clinicId || expert.clinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Người quản lý phòng khám chỉ có thể quản lý các chuyên gia trong phòng khám của mình',
        );
      }
    }
  }

  private assertCallerCanManageConsultationFee(
    caller: CallerContext,
    expert: Expert,
  ): void {
    if (hasAnyRole(caller.roles, [Role.AppAdmin])) {
      return;
    }

    if (hasAnyRole(caller.roles, [Role.ClinicManager])) {
      if (!caller.clinicId || expert.clinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Người quản lý phòng khám chỉ có thể quản lý phí tư vấn cho các chuyên gia trong phòng khám của mình',
        );
      }
      return;
    }

    if (hasAnyRole(caller.roles, [Role.Expert])) {
      if (expert.userId !== caller.userId) {
        throw new ForbiddenException(
          'Chuyên gia chỉ có thể quản lý phí tư vấn của chính mình',
        );
      }
      return;
    }

    throw new ForbiddenException('Không đủ quyền để quản lý phí tư vấn');
  }

  private buildBaseQuery(query: ListExpertsQueryDto) {
    const qb = this.expertRepository
      .createQueryBuilder('expert')
      .innerJoinAndSelect('expert.user', 'user')
      .innerJoinAndSelect('expert.clinic', 'clinic')
      .where('expert.isActive = :isActive', { isActive: true })
      .andWhere('expert.clinicId IS NOT NULL')
      .andWhere('clinic.isActive = :clinicActive', { clinicActive: true });

    if (query.clinicId) {
      qb.andWhere('expert.clinicId = :clinicId', { clinicId: query.clinicId });
    }

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
    const clinic = expert.clinic;
    const clinicId = expert.clinicId;
    const clinicName = clinic?.name ?? '';
    const address = clinic?.address ?? '';

    return {
      id: expert.id,
      name: expert.user?.name ?? null,
      email: expert.user?.email ?? null,
      clinicId,
      clinicName,
      clinic: {
        id: clinic?.id ?? clinicId,
        name: clinicName,
        address,
      },
      specialization: expert.specialization,
      licenseNumber: expert.licenseNumber,
      bio: expert.bio,
      avatarUrl: expert.avatarUrl ?? null,
      rating: Number(expert.rating),
      consultationFee: Number(expert.consultationFee),
      distanceKm,
      isActive: expert.isActive,
      createdAt: expert.createdAt,
      updatedAt: expert.updatedAt,
    };
  }

  private toFeedbackItem(feedback: Feedback): ExpertFeedbackItemDto {
    return {
      id: feedback.id,
      consultationId: feedback.consultationId,
      rating: feedback.rating,
      comment: feedback.comment,
      customerName: feedback.consultation?.customer?.user?.name ?? null,
      createdAt: feedback.createdAt,
    };
  }
}
