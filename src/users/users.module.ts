import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClinicsModule } from '../clinics/clinics.module';
import { User } from './user.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    ClinicsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, SessionGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
