import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';
import {
  APP_ROLES,
  filterAppRoles,
  hasAnyRole,
  isAppRole,
  MANAGED_ROLES,
  Role,
} from '../auth/roles.enum';
import { ClinicsService } from '../clinics/clinics.service';
import { KeycloakAdminService } from '../keycloak/keycloak-admin.service';
import { SurveyRecommendation } from '../recommendations/survey-recommendation.entity';
import { Label } from '../survey/label.entity';
import { CustomerAllergy } from './customer-allergy.entity';
import { Customer } from './customer.entity';
import { AdminUpdateCustomerProfileDto } from './dto/admin-update-customer-profile.dto';
import { User } from './user.entity';

export type UpsertResult = {
  user: User;
  isNewUser: boolean;
};

export type ListUsersQuery = {
  q?: string;
  role?: Role;
  clinicId?: string;
  page?: number;
  limit?: number;
};

export type CreateManagedUserInput = {
  email: string;
  name: string;
  role: Role;
  clinicId?: string;
  temporaryPassword: string;
};

export type CallerContext = {
  userId: string;
  roles: Role[];
  clinicId?: string | null;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly keycloakAdmin: KeycloakAdminService,
    private readonly clinicsService: ClinicsService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(CustomerAllergy)
    private readonly customerAllergyRepository: Repository<CustomerAllergy>,
    @InjectRepository(SurveyRecommendation)
    private readonly surveyRecommendationRepository: Repository<SurveyRecommendation>,
    @InjectRepository(Label)
    private readonly labelRepository: Repository<Label>,
  ) {}

  /**
   * Upsert a user from a Keycloak profile.
   * On first login the user row is created; on subsequent logins
   * mutable fields (email, name, roles) are refreshed from the latest claims.
   */
  async upsertFromKeycloak(
    profile: Record<string, unknown>,
    provider = 'keycloak',
    roles?: Role[],
  ): Promise<UpsertResult> {
    const sub = profile.sub as string;
    const email = (profile.email as string | undefined) ?? null;
    const name =
      (profile.name as string | undefined) ??
      (profile.preferred_username as string | undefined) ??
      null;
    const resolvedRoles = filterAppRoles(roles?.map(String));

    const existing = await this.userRepository.findOneBy({ keycloakSub: sub });

    if (!existing) {
      this.logger.log(
        `New user registered — provider: ${provider}, email: ${email ?? sub}`,
      );
      const created = this.userRepository.create({
        keycloakSub: sub,
        email,
        name,
        provider,
        roles: resolvedRoles,
        clinicId: null,
      });
      const user = await this.userRepository.save(created);
      await this.ensureCustomerProfile(user.id, user.roles);
      return { user, isNewUser: true };
    }

    existing.email = email ?? existing.email;
    existing.name = name ?? existing.name;
    existing.roles = resolvedRoles;
    const user = await this.userRepository.save(existing);
    await this.ensureCustomerProfile(user.id, user.roles);
    return { user, isNewUser: false };
  }

  private async ensureCustomerProfile(
    userId: string,
    roles: Role[],
  ): Promise<void> {
    if (roles.includes(Role.Customer)) {
      const existing = await this.customerRepository.findOne({
        where: { userId },
      });
      if (!existing) {
        await this.customerRepository.save(
          this.customerRepository.create({ userId }),
        );
      }
    }
  }

  async adminUpdateCustomerProfile(
    customerId: string,
    dto: AdminUpdateCustomerProfileDto,
  ) {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
      relations: ['user'],
    });
    if (!customer) {
      throw new NotFoundException(`Customer ${customerId} not found`);
    }

    if (dto.fullName !== undefined) {
      if (customer.user && dto.fullName.trim()) {
        customer.user.name = dto.fullName.trim();
        await this.userRepository.save(customer.user);
      }
    }
    if (dto.phone !== undefined) {
      customer.phone = dto.phone.trim() || null;
    }
    if (dto.age !== undefined && dto.age !== null) {
      if (dto.age > 0) {
        const now = new Date();
        customer.dateOfBirth = new Date(now.getFullYear() - dto.age, 0, 1);
      } else {
        customer.dateOfBirth = null;
      }
    }

    await this.customerRepository.save(customer);

    if (dto.allergyCodes !== undefined) {
      await this.customerAllergyRepository.delete({ customerId: customer.id });
      if (dto.allergyCodes.length > 0) {
        const labels = await this.labelRepository.find({
          where: {
            code: In(dto.allergyCodes.map((c) => c.trim())),
            category: { code: 'ALLERGY' },
          },
        });
        for (const label of labels) {
          await this.customerAllergyRepository.save(
            this.customerAllergyRepository.create({
              customerId: customer.id,
              labelId: label.id,
            }),
          );
        }
      }
      await this.surveyRecommendationRepository.delete({
        customerId: customer.id,
      });
    }

    return this.customerRepository.findOneOrFail({
      where: { id: customer.id },
      relations: [
        'user',
        'allergies',
        'allergies.label',
        'skinTypeDetails',
        'skinTypeDetails.skinType',
      ],
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async findByKeycloakSub(sub: string): Promise<User | null> {
    return this.userRepository.findOneBy({ keycloakSub: sub });
  }

  async getOwnProfile(userId: string): Promise<User> {
    const user = await this.requireById(userId);
    return user;
  }

  async updateOwnProfile(userId: string, name?: string): Promise<User> {
    const user = await this.requireById(userId);
    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        throw new BadRequestException('name must not be empty');
      }
      user.name = trimmed;
      await this.syncNameToKeycloak(user.keycloakSub, trimmed);
    }
    return this.userRepository.save(user);
  }

  async listUsers(
    caller: CallerContext,
    query: ListUsersQuery,
  ): Promise<{ items: User[]; total: number; page: number; limit: number }> {
    this.assertCanListUsers(caller);

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.userRepository.createQueryBuilder('user');

    if (query.q?.trim()) {
      const term = `%${query.q.trim()}%`;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('user.email ILIKE :term', { term })
            .orWhere('user.name ILIKE :term', { term });
        }),
      );
    }

    if (query.role && isAppRole(query.role)) {
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('user.roles = :roleExact', { roleExact: query.role })
            .orWhere('user.roles LIKE :roleStart', {
              roleStart: `${query.role},%`,
            })
            .orWhere('user.roles LIKE :roleMiddle', {
              roleMiddle: `%,${query.role},%`,
            })
            .orWhere('user.roles LIKE :roleEnd', {
              roleEnd: `%,${query.role}`,
            });
        }),
      );
    }

    const scopedClinicId = this.resolveListClinicScope(caller, query.clinicId);
    if (scopedClinicId) {
      qb.andWhere('user.clinicId = :clinicId', { clinicId: scopedClinicId });
    }

    qb.orderBy('user.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getByIdForCaller(caller: CallerContext, id: string): Promise<User> {
    this.assertCanListUsers(caller);
    const user = await this.requireById(id);
    this.assertClinicAccess(caller, user);
    return user;
  }

  async createManagedUser(
    caller: CallerContext,
    input: CreateManagedUserInput,
  ): Promise<User> {
    this.validateCreateInput(input);
    this.assertCanCreateRole(caller, input.role);

    let clinicId = input.clinicId ?? null;
    if (caller.roles.includes(Role.ClinicManager)) {
      clinicId = caller.clinicId ?? null;
      if (!clinicId) {
        throw new ForbiddenException('Clinic manager is not bound to a clinic');
      }
    }

    if (input.role === Role.Expert || input.role === Role.ClinicManager) {
      if (!clinicId) {
        throw new BadRequestException(
          'clinicId is required for expert and clinic_manager roles',
        );
      }
      await this.clinicsService.requireById(clinicId);
    } else {
      clinicId = null;
    }

    const adminToken = await this.keycloakAdmin.getAdminToken();
    const { firstName, lastName } = splitName(input.name);
    const username = input.email.trim().toLowerCase();

    const keycloakId = await this.keycloakAdmin.createUser(adminToken, {
      username,
      email: input.email.trim(),
      firstName,
      lastName,
      enabled: true,
      emailVerified: false,
      requiredActions: ['UPDATE_PASSWORD', 'VERIFY_EMAIL'],
      credentials: [
        {
          type: 'password',
          value: input.temporaryPassword,
          temporary: true,
        },
      ],
      attributes: clinicId ? { clinicId: [clinicId] } : undefined,
    });

    const roleRep = await this.keycloakAdmin.getRealmRole(
      adminToken,
      input.role,
    );
    await this.keycloakAdmin.assignRealmRoles(adminToken, keycloakId, [
      roleRep,
    ]);

    const user = this.userRepository.create({
      keycloakSub: keycloakId,
      email: input.email.trim(),
      name: input.name.trim(),
      provider: 'keycloak',
      roles: [input.role],
      clinicId,
      isActive: true,
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Managed user created — role: ${input.role}, email: ${saved.email}, by: ${caller.userId}`,
    );
    return saved;
  }

  async assignRoles(
    caller: CallerContext,
    userId: string,
    roles: Role[],
  ): Promise<User> {
    if (!hasAnyRole(caller.roles, [Role.AppAdmin])) {
      throw new ForbiddenException('Only app_admin can assign roles');
    }

    const uniqueRoles = [...new Set(roles)];
    if (!uniqueRoles.length) {
      throw new BadRequestException('At least one role is required');
    }
    for (const role of uniqueRoles) {
      if (!isAppRole(role)) {
        throw new BadRequestException(`Invalid role: ${String(role)}`);
      }
    }

    const user = await this.requireById(userId);
    const adminToken = await this.keycloakAdmin.getAdminToken();

    await this.keycloakAdmin.replaceUserAppRoles(
      adminToken,
      user.keycloakSub,
      uniqueRoles,
      APP_ROLES as unknown as string[],
    );

    user.roles = uniqueRoles;

    if (
      !uniqueRoles.includes(Role.Expert) &&
      !uniqueRoles.includes(Role.ClinicManager)
    ) {
      user.clinicId = null;
      await this.keycloakAdmin.setUserAttributes(adminToken, user.keycloakSub, {
        clinicId: [],
      });
    }

    return this.userRepository.save(user);
  }

  async setStatus(
    caller: CallerContext,
    userId: string,
    isActive: boolean,
  ): Promise<User> {
    if (!hasAnyRole(caller.roles, [Role.AppAdmin])) {
      throw new ForbiddenException('Only app_admin can change user status');
    }

    const user = await this.requireById(userId);
    const adminToken = await this.keycloakAdmin.getAdminToken();
    await this.keycloakAdmin.setUserEnabled(
      adminToken,
      user.keycloakSub,
      isActive,
    );

    user.isActive = isActive;
    return this.userRepository.save(user);
  }

  private async requireById(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return user;
  }

  private assertCanListUsers(caller: CallerContext): void {
    if (
      !hasAnyRole(caller.roles, [Role.AppAdmin, Role.Staff, Role.ClinicManager])
    ) {
      throw new ForbiddenException('Insufficient permissions to list users');
    }
  }

  private assertClinicAccess(caller: CallerContext, target: User): void {
    if (hasAnyRole(caller.roles, [Role.AppAdmin, Role.Staff])) {
      return;
    }
    if (caller.roles.includes(Role.ClinicManager)) {
      if (!caller.clinicId || target.clinicId !== caller.clinicId) {
        throw new ForbiddenException(
          'Clinic manager can only access users in their clinic',
        );
      }
    }
  }

  private resolveListClinicScope(
    caller: CallerContext,
    requestedClinicId?: string,
  ): string | undefined {
    if (caller.roles.includes(Role.ClinicManager)) {
      return caller.clinicId ?? undefined;
    }
    return requestedClinicId;
  }

  private assertCanCreateRole(caller: CallerContext, role: Role): void {
    if (!MANAGED_ROLES.includes(role)) {
      throw new BadRequestException(
        `Role ${role} cannot be created via user management`,
      );
    }

    if (hasAnyRole(caller.roles, [Role.AppAdmin])) {
      return;
    }

    if (caller.roles.includes(Role.ClinicManager) && role === Role.Expert) {
      return;
    }

    throw new ForbiddenException(
      'Insufficient permissions to create this role',
    );
  }

  private validateCreateInput(input: CreateManagedUserInput): void {
    if (!input.email?.trim()) {
      throw new BadRequestException('email is required');
    }
    if (!input.name?.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!input.temporaryPassword?.trim()) {
      throw new BadRequestException('temporaryPassword is required');
    }
    if (!isAppRole(input.role)) {
      throw new BadRequestException('Invalid role');
    }
  }

  private async syncNameToKeycloak(
    keycloakSub: string,
    name: string,
  ): Promise<void> {
    const adminToken = await this.keycloakAdmin.getAdminToken();
    const { firstName, lastName } = splitName(name);
    await this.keycloakAdmin.updateUser(adminToken, keycloakSub, {
      firstName,
      lastName,
    });
  }
}

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: name.trim(), lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}
