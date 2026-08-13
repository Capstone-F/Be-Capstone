import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { ClinicsService } from '../clinics/clinics.service';
import { ClinicStatementService } from './clinic-statement.service';
import { ClinicWithdrawalsService } from './clinic-withdrawals.service';
import { PaginatedClinicTransactionsDto } from './dto/clinic-transaction-response.dto';
import {
  ClinicWithdrawalResponseDto,
  PaginatedClinicWithdrawalsDto,
} from './dto/clinic-withdrawal-response.dto';
import { ClinicWalletSummaryDto } from './dto/clinic-wallet-summary.dto';
import {
  RequestClinicWithdrawalDto,
  UpdateClinicBankAccountDto,
} from './dto/clinic-finance.dto';
import {
  ListClinicTransactionsQueryDto,
  ListClinicWithdrawalsQueryDto,
} from './dto/list-finance-query.dto';

@ApiTags('Clinic Finance')
@Controller('clinic')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.ClinicManager)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ClinicFinanceController {
  constructor(
    private readonly statementService: ClinicStatementService,
    private readonly withdrawalsService: ClinicWithdrawalsService,
    private readonly clinicsService: ClinicsService,
  ) {}

  @Get('wallet')
  @ApiOperation({
    summary: 'Clinic wallet summary (balance, held escrow, bank account)',
  })
  @ApiOkResponse({ type: ClinicWalletSummaryDto })
  getWallet(@Req() req: Request): Promise<ClinicWalletSummaryDto> {
    return this.statementService.getWalletSummary(this.requireClinicId(req));
  }

  @Put('bank-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set clinic bank account for withdrawals' })
  @ApiOkResponse({ type: ClinicWalletSummaryDto })
  async updateBankAccount(
    @Req() req: Request,
    @Body() dto: UpdateClinicBankAccountDto,
  ): Promise<ClinicWalletSummaryDto> {
    const clinicId = this.requireClinicId(req);
    await this.clinicsService.updateBankAccount(clinicId, dto);
    return this.statementService.getWalletSummary(clinicId);
  }

  @Get('transactions')
  @ApiOperation({
    summary: 'Clinic ledger statement (all transactions for this clinic)',
  })
  @ApiOkResponse({ type: PaginatedClinicTransactionsDto })
  listTransactions(
    @Req() req: Request,
    @Query() query: ListClinicTransactionsQueryDto,
  ): Promise<PaginatedClinicTransactionsDto> {
    return this.statementService.listTransactions(
      this.requireClinicId(req),
      query,
    );
  }

  @Post('withdrawals')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a withdrawal (debits clinic wallet immediately)',
  })
  @ApiOkResponse({ type: ClinicWithdrawalResponseDto })
  requestWithdrawal(
    @Req() req: Request,
    @Body() dto: RequestClinicWithdrawalDto,
  ): Promise<ClinicWithdrawalResponseDto> {
    const auth = this.requireAuth(req);
    return this.withdrawalsService.requestWithdrawal(
      this.requireClinicId(req),
      auth.userId,
      dto.amountVnd,
    );
  }

  @Get('withdrawals')
  @ApiOperation({ summary: 'List withdrawals for own clinic' })
  @ApiOkResponse({ type: PaginatedClinicWithdrawalsDto })
  listWithdrawals(
    @Req() req: Request,
    @Query() query: ListClinicWithdrawalsQueryDto,
  ): Promise<PaginatedClinicWithdrawalsDto> {
    return this.withdrawalsService.listForClinic(
      this.requireClinicId(req),
      query.page,
      query.limit,
    );
  }

  private requireAuth(req: Request) {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth;
  }

  private requireClinicId(req: Request): string {
    const auth = this.requireAuth(req);
    if (!auth.clinicId) {
      throw new ForbiddenException('Clinic manager is not bound to a clinic');
    }
    return auth.clinicId;
  }
}
