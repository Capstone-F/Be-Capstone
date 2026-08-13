import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import {
  AdminDashboardController,
  ExpertDashboardController,
  StaffDashboardController,
} from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminDashboardController,
    ExpertDashboardController,
    StaffDashboardController,
  ],
  providers: [DashboardService],
})
export class DashboardModule {}
