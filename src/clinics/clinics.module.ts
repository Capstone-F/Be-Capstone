import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Clinic } from './clinic.entity';
import { ClinicsService } from './clinics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Clinic])],
  providers: [ClinicsService],
  exports: [ClinicsService, TypeOrmModule],
})
export class ClinicsModule {}
