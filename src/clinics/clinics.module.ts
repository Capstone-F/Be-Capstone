import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AdminClinicBalancesService } from '../finance/admin-clinic-balances.service';
import { AdminClinicsController } from './admin-clinics.controller';
import { Clinic } from './clinic.entity';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic]), forwardRef(() => AuthModule)],
  controllers: [ClinicsController, AdminClinicsController],
  // AdminClinicBalancesService only needs the DataSource, so it is provided
  // here directly instead of importing FinanceModule (module cycle).
  providers: [ClinicsService, AdminClinicBalancesService],
  exports: [ClinicsService, TypeOrmModule],
})
export class ClinicsModule {}
