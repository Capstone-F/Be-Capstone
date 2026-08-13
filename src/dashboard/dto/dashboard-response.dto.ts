import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DashboardRange } from './dashboard-query.dto';

export class DashboardPeriodDto {
  @ApiProperty({ enum: DashboardRange, example: DashboardRange.THIRTY_DAYS })
  range!: DashboardRange;

  @ApiProperty({ example: '2026-07-15' })
  from!: string;

  @ApiProperty({ example: '2026-08-13' })
  to!: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  timezone!: string;
}

export class AdminDashboardMetricsDto {
  @ApiProperty() activeCustomers!: number;
  @ApiProperty() activeExperts!: number;
  @ApiProperty() activeClinics!: number;
  @ApiProperty() paidOrders!: number;
  @ApiProperty() netProductRevenueVnd!: number;
  @ApiProperty() netConsultationFeesVnd!: number;
}

export class AdminDashboardAttentionDto {
  @ApiProperty() submittedStockForms!: number;
  @ApiProperty() openCancellations!: number;
  @ApiProperty() failedWorkflows!: number;
  @ApiProperty() expertsMissingProfile!: number;
}

export class AdminDashboardTrendPointDto {
  @ApiProperty({ example: '2026-08-13' }) date!: string;
  @ApiProperty() newCustomers!: number;
  @ApiProperty() netProductRevenueVnd!: number;
  @ApiProperty() netConsultationFeesVnd!: number;
}

export class DashboardActivityDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    enum: [
      'USER_CREATED',
      'PRODUCT_PAYMENT',
      'CONSULTATION_PAYMENT',
      'REFUND',
      'ORDER_CANCELLATION',
      'STOCK_IMPORT',
    ],
  })
  type!: string;
  @ApiProperty() title!: string;
  @ApiPropertyOptional({ nullable: true }) description!: string | null;
  @ApiPropertyOptional({ nullable: true }) amountVnd!: number | null;
  @ApiProperty() occurredAt!: Date;
}

export class AdminDashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodDto }) period!: DashboardPeriodDto;
  @ApiProperty({ type: AdminDashboardMetricsDto })
  metrics!: AdminDashboardMetricsDto;
  @ApiProperty({ type: AdminDashboardAttentionDto })
  attention!: AdminDashboardAttentionDto;
  @ApiProperty({ type: [AdminDashboardTrendPointDto] })
  trend!: AdminDashboardTrendPointDto[];
  @ApiProperty({ type: [DashboardActivityDto] })
  recentActivity!: DashboardActivityDto[];
}

export class ExpertDashboardMetricsDto {
  @ApiProperty() appointmentsToday!: number;
  @ApiProperty() paidPendingConfirmation!: number;
  @ApiProperty() completedConsultations!: number;
  @ApiProperty() followUpConsultations!: number;
  @ApiProperty() netConsultationFeesVnd!: number;
  @ApiProperty() averageRating!: number;
  @ApiProperty() ratingCount!: number;
}

export class ExpertDashboardTrendPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() completedConsultations!: number;
  @ApiProperty() netConsultationFeesVnd!: number;
}

export class ExpertBookingQueueItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) customerName!: string | null;
  @ApiPropertyOptional({ nullable: true }) reason!: string | null;
  @ApiProperty() scheduledAt!: Date;
  @ApiProperty() isFollowUp!: boolean;
  @ApiProperty() feeChargedVnd!: number;
}

export class ExpertDashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodDto }) period!: DashboardPeriodDto;
  @ApiProperty({ type: ExpertDashboardMetricsDto })
  metrics!: ExpertDashboardMetricsDto;
  @ApiProperty({ type: [ExpertDashboardTrendPointDto] })
  trend!: ExpertDashboardTrendPointDto[];
  @ApiProperty({ type: [ExpertBookingQueueItemDto] })
  pendingConfirmation!: ExpertBookingQueueItemDto[];
  @ApiProperty({ type: [ExpertBookingQueueItemDto] })
  upcomingBookings!: ExpertBookingQueueItemDto[];
}

export class StaffDashboardMetricsDto {
  @ApiProperty() unassignedOpenSupport!: number;
  @ApiProperty() myActiveSupport!: number;
  @ApiProperty() submittedStockForms!: number;
  @ApiProperty() returnsReadyForInspection!: number;
  @ApiProperty() failedWorkflows!: number;
}

export class StaffDashboardTrendPointDto {
  @ApiProperty() date!: string;
  @ApiProperty() openedSupportSessions!: number;
  @ApiProperty() closedSupportSessions!: number;
  @ApiProperty() submittedStockForms!: number;
  @ApiProperty() confirmedStockForms!: number;
}

export class StaffSupportQueueItemDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) customerName!: string | null;
  @ApiPropertyOptional({ nullable: true }) subject!: string | null;
  @ApiProperty() waitingSince!: Date;
}

export class StaffStockQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() sku!: string;
  @ApiProperty() productName!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() submittedAt!: Date;
}

export class StaffReturnQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() refundAmountVnd!: number;
  @ApiProperty() returnedAt!: Date;
}

export class StaffWorkflowFailureDto {
  @ApiProperty() id!: string;
  @ApiProperty() orderId!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true }) lastError!: string | null;
  @ApiProperty() updatedAt!: Date;
}

export class StaffDashboardQueuesDto {
  @ApiProperty({ type: [StaffSupportQueueItemDto] })
  openSupportSessions!: StaffSupportQueueItemDto[];
  @ApiProperty({ type: [StaffStockQueueItemDto] })
  submittedStockForms!: StaffStockQueueItemDto[];
  @ApiProperty({ type: [StaffReturnQueueItemDto] })
  readyReturns!: StaffReturnQueueItemDto[];
  @ApiProperty({ type: [StaffWorkflowFailureDto] })
  workflowFailures!: StaffWorkflowFailureDto[];
}

export class StaffDashboardResponseDto {
  @ApiProperty({ type: DashboardPeriodDto }) period!: DashboardPeriodDto;
  @ApiProperty({ type: StaffDashboardMetricsDto })
  metrics!: StaffDashboardMetricsDto;
  @ApiProperty({ type: [StaffDashboardTrendPointDto] })
  trend!: StaffDashboardTrendPointDto[];
  @ApiProperty({ type: StaffDashboardQueuesDto })
  queues!: StaffDashboardQueuesDto;
}
