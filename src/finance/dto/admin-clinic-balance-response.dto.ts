import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdminClinicBalanceDto {
  @ApiProperty()
  clinicId!: string;

  @ApiProperty({ example: 'Phòng khám Quận 1' })
  clinicName!: string;

  @ApiProperty({
    example: '12500000',
    description: 'Available (withdrawable) wallet balance',
  })
  balanceVnd!: string;

  @ApiProperty({
    example: '3200000',
    description: 'Held in escrow, not yet withdrawable',
  })
  heldEscrowVnd!: string;

  @ApiProperty({
    example: '5000000',
    description:
      'Withdrawal requests awaiting admin review (already debited from the available balance)',
  })
  pendingWithdrawalsVnd!: string;

  @ApiProperty({
    example: '1450000',
    description: 'Platform commission collected from this clinic (all time)',
  })
  commissionEarnedVnd!: string;

  @ApiPropertyOptional({ nullable: true })
  lastPayoutAt!: Date | null;
}

export class PaginatedAdminClinicBalancesDto {
  @ApiProperty({ type: [AdminClinicBalanceDto] })
  items!: AdminClinicBalanceDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;
}
