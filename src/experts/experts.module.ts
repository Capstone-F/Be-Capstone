import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Expert } from '../users/expert.entity';
import { ExpertsController } from './experts.controller';
import { ExpertsService } from './experts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expert]), AuthModule],
  controllers: [ExpertsController],
  providers: [ExpertsService],
  exports: [ExpertsService],
})
export class ExpertsModule {}
