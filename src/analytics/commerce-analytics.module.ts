import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { SessionGuard } from '../auth/guards/session.guard';
import { CommerceAnalyticsController } from './commerce-analytics.controller';
import { CommerceAnalyticsEvent } from './commerce-analytics-event.entity';
import { CommerceAnalyticsService } from './commerce-analytics.service';

@Module({
  imports: [TypeOrmModule.forFeature([CommerceAnalyticsEvent]), AuthModule],
  controllers: [CommerceAnalyticsController],
  providers: [CommerceAnalyticsService, SessionGuard],
  exports: [CommerceAnalyticsService],
})
export class CommerceAnalyticsModule {}
