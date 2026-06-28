import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ClinicsModule } from '../clinics/clinics.module';
import { Customer } from './customer.entity';
import { Expert } from './expert.entity';
import { User } from './user.entity';
import { Wallet } from './wallet.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Customer, Expert, Wallet]),
    ClinicsModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [UsersController],
  providers: [UsersService, SessionGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
