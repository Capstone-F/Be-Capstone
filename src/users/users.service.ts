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
   * Upsert a user from an Auth0 ID/access token profile.
   * On first login the user row is created; on subsequent logins
   * mutable fields (email, name) are refreshed from the latest claims.
   *
   * @param profile  Decoded JWT claims (id_token preferred, access_token fallback)
   */
  async upsertFromAuth0(
    profile: Record<string, unknown>,
  ): Promise<UpsertResult> {
    const sub = profile.sub as string;
    const email = (profile.email as string | undefined) ?? null;
    const name =
      (profile.name as string | undefined) ??
      (profile.nickname as string | undefined) ??
      (profile.preferred_username as string | undefined) ??
      null;

    const existing = await this.userRepository.findOneBy({ auth0Sub: sub });

    if (!existing) {
      this.logger.log(
        `New user registered — sub: ${sub}, email: ${email ?? '∅'}`,
      );
      const created = this.userRepository.create({
        auth0Sub: sub,
        email,
        name,
      });
      const user = await this.userRepository.save(created);
      return { user, isNewUser: true };
    }

    existing.email = email ?? existing.email;
    existing.name = name ?? existing.name;
    const user = await this.userRepository.save(existing);
    return { user, isNewUser: false };
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOneBy({ id });
  }

  async findByAuth0Sub(sub: string): Promise<User | null> {
    return this.userRepository.findOneBy({ auth0Sub: sub });
  }
}
