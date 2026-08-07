import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { MobileAuthController } from './mobile-auth.controller';
import { MobileAuthService } from './mobile-auth.service';
import { MobileOauthStateService } from './mobile-oauth-state.service';
import { MobileAuthCodeService } from './mobile-auth-code.service';
import { RolesGuard } from './guards/roles.guard';
import { SessionGuard } from './guards/session.guard';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';

import { SurveyModule } from '../survey/survey.module';

@Module({
  imports: [
    forwardRef(() => UsersModule),
    forwardRef(() => SurveyModule),
    RedisModule,
  ],
  controllers: [AuthController, MobileAuthController],
  providers: [
    AuthService,
    MobileAuthService,
    MobileOauthStateService,
    MobileAuthCodeService,
    SessionGuard,
    RolesGuard,
  ],
  exports: [
    AuthService,
    SessionGuard,
    RolesGuard,
    forwardRef(() => UsersModule),
  ],
})
export class AuthModule {}
