import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TreatmentStatus } from './enums';
import { TreatmentPhase } from './treatment-phase.entity';

/**
 * Guard shared by cart and order creation for TREATMENT-source purchases.
 * The phase must be loaded with its `treatment` relation.
 */
export function assertTreatmentPhasePurchasable(
  phase: TreatmentPhase,
  customerId: string,
): void {
  if (!phase.treatment) {
    throw new BadRequestException(
      'Giai đoạn liệu trình chưa được nạp kèm liệu trình',
    );
  }
  if (phase.treatment.customerId !== customerId) {
    throw new ForbiddenException(
      'Giai đoạn liệu trình không thuộc về khách hàng này',
    );
  }
  if (!phase.treatment.paidAt) {
    throw new BadRequestException(
      'Liệu trình chưa được thanh toán — không thể mua sản phẩm theo liệu trình',
    );
  }
  if (phase.treatment.status === TreatmentStatus.CANCELLED) {
    throw new BadRequestException(
      'Liệu trình đã bị hủy — không thể mua sản phẩm theo liệu trình',
    );
  }
}
