import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { AdminWalletTopUpResponseDto } from './dto/admin-wallet-top-up-response.dto';
import { AdminWalletTopUpDto } from './dto/admin-wallet-top-up.dto';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { WalletService } from './wallet.service';

@ApiTags('Admin Wallet')
@Controller('admin/wallets')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminWalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get(':userId')
  @Roles(Role.AppAdmin)
  @ApiOperation({
    summary: 'Get wallet balance for a user (app_admin)',
    description: 'Creates a zero-balance wallet if the user has none yet.',
  })
  @ApiOkResponse({ type: WalletBalanceDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  getBalance(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<WalletBalanceDto> {
    return this.walletService.getBalanceForUser(userId);
  }

  @Post(':userId/top-up')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Credit wallet for a specific user (app_admin)',
    description:
      'Direct ledger credit (WALLET_TOPUP). Does not go through payment gateway.',
  })
  @ApiOkResponse({ type: AdminWalletTopUpResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  topUp(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: AdminWalletTopUpDto,
  ): Promise<AdminWalletTopUpResponseDto> {
    return this.walletService.adminTopUp(userId, dto.amountVnd, dto.note);
  }
}
