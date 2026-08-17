import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminActivityController,
  AdminDashboardController,
  ExpertDashboardController,
  StaffDashboardController,
} from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminDashboardController,
    AdminActivityController,
    ExpertDashboardController,
    StaffDashboardController,
  ],
  providers: [DashboardService],
})
export class DashboardModule {}
