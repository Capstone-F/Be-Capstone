import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Clinic } from './clinic.entity';
import { ClinicsController } from './clinics.controller';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic]), forwardRef(() => AuthModule)],
  controllers: [ClinicsController],
  providers: [ClinicsService],
  exports: [ClinicsService, TypeOrmModule],
})
export class ClinicsModule {}
