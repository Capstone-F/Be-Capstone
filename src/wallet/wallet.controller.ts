import {
  Body,
  Controller,
  Get,
  Post,
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
import { CheckoutResponseDto } from '../payments/dto/checkout-response.dto';
import { PaymentsService } from '../payments/payments.service';
import { WalletBalanceDto } from './dto/wallet-balance.dto';
import { WalletTopUpDto } from './dto/wallet-top-up.dto';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@Controller('wallet')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class WalletController {
  constructor(
    private readonly walletService: WalletService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get('me')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Get own wallet balance' })
  @ApiOkResponse({ type: WalletBalanceDto })
  getMe(@Req() req: Request): Promise<WalletBalanceDto> {
    return this.walletService.getBalance(this.requireUserId(req));
  }

  @Post('top-up')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Top up wallet via payment gateway',
    description:
      'Creates a WALLET_TOPUP Payment and returns paymentUrl from PAYMENT_PROVIDER (VNPay or mock).',
  })
  @ApiOkResponse({ type: CheckoutResponseDto })
  topUp(
    @Req() req: Request,
    @Body() dto: WalletTopUpDto,
  ): Promise<CheckoutResponseDto> {
    return this.paymentsService.topUpWallet(
      this.requireUserId(req),
      dto,
      req.ip ?? '127.0.0.1',
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
