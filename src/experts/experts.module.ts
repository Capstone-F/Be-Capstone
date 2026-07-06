import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { Expert } from '../users/expert.entity';
import { ExpertsController } from './experts.controller';
import { ExpertsService } from './experts.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expert]), AuthModule],
  controllers: [ExpertsController],
  providers: [ExpertsService, SessionGuard],
  exports: [ExpertsService],
})
export class ExpertsModule {}
