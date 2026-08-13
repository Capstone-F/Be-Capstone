import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { ClinicWithdrawalsService } from './clinic-withdrawals.service';
import {
  ClinicWithdrawalResponseDto,
  PaginatedClinicWithdrawalsDto,
} from './dto/clinic-withdrawal-response.dto';
import {
  MarkWithdrawalPaidDto,
  RejectWithdrawalDto,
} from './dto/clinic-finance.dto';
import { ListAdminClinicWithdrawalsQueryDto } from './dto/list-finance-query.dto';

@ApiTags('Admin Clinic Withdrawals')
@Controller('admin/clinic-withdrawals')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminClinicWithdrawalsController {
  constructor(private readonly withdrawalsService: ClinicWithdrawalsService) {}

  @Get()
  @ApiOperation({ summary: 'List clinic withdrawal requests' })
  @ApiOkResponse({ type: PaginatedClinicWithdrawalsDto })
  list(
    @Query() query: ListAdminClinicWithdrawalsQueryDto,
  ): Promise<PaginatedClinicWithdrawalsDto> {
    return this.withdrawalsService.listAdmin(query);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark withdrawal as paid after manual bank transfer from platform account',
  })
  @ApiOkResponse({ type: ClinicWithdrawalResponseDto })
  markPaid(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MarkWithdrawalPaidDto,
  ): Promise<ClinicWithdrawalResponseDto> {
    return this.withdrawalsService.markPaid(
      id,
      this.requireUserId(req),
      dto.transferRef,
      dto.note,
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject withdrawal and re-credit clinic wallet',
  })
  @ApiOkResponse({ type: ClinicWithdrawalResponseDto })
  reject(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectWithdrawalDto,
  ): Promise<ClinicWithdrawalResponseDto> {
    return this.withdrawalsService.reject(
      id,
      this.requireUserId(req),
      dto.note,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
