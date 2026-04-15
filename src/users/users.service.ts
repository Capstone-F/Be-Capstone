import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export type UpsertResult = {
  user: User;
  isNewUser: boolean;
};

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Upsert a user from a Keycloak profile.
   * On first login the user row is created; on subsequent logins
   * mutable fields (email, name) are refreshed from the latest claims.
   *
   * @param profile  Raw claims from Keycloak /userinfo endpoint
   * @param provider Identity provider hint ('google', 'keycloak', …)
   */
  async upsertFromKeycloak(
    profile: Record<string, unknown>,
    provider = 'keycloak',
  ): Promise<UpsertResult> {
    const sub = profile.sub as string;
    const email = (profile.email as string | undefined) ?? null;
    const name =
      (profile.name as string | undefined) ??
      (profile.preferred_username as string | undefined) ??
      null;

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
      });
      const user = await this.userRepository.save(created);
      return { user, isNewUser: true };
    }

    // Refresh mutable fields on every login
    existing.email = email ?? existing.email;
    existing.name = name ?? existing.name;
    const user = await this.userRepository.save(existing);
    return { user, isNewUser: false };
  }

  async findByKeycloakSub(sub: string): Promise<User | null> {
    return this.userRepository.findOneBy({ keycloakSub: sub });
  }
}
