import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ReturnQueryFromVNPay } from 'vnpay';
import { getAuthContext } from '../auth/auth-context';
import { SessionGuard } from '../auth/guards/session.guard';
import { CheckoutDto } from './dto/checkout.dto';
import { CheckoutResponseDto } from './dto/checkout-response.dto';
import { PaymentStatusDto } from './dto/payment-status.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('checkout')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiOperation({
    summary: 'Create a payment for a pending order',
    description:
      'Creates (or reuses) a Payment for the order and returns a paymentUrl from the active gateway (PAYMENT_PROVIDER). Redirect the customer to paymentUrl.',
  })
  @ApiOkResponse({ type: CheckoutResponseDto })
  checkout(
    @Req() req: Request,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.paymentsService.checkout(
      this.requireUserId(req),
      dto,
      req.ip ?? '127.0.0.1',
    );
  }

  // Declared before ':id' so the literal path is not captured by the param route.
  @Get('vnpay/return')
  @ApiExcludeEndpoint()
  async vnpayReturn(
    @Query() query: ReturnQueryFromVNPay,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.paymentsService.handleReturn(query);
    res.redirect(redirectUrl);
  }

  @Get('vnpay/ipn')
  @ApiExcludeEndpoint()
  async vnpayIpn(@Query() query: ReturnQueryFromVNPay): Promise<unknown> {
    return this.paymentsService.handleIpn(query);
  }

  @Get('payos/return')
  @ApiExcludeEndpoint()
  async payosReturn(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.paymentsService.handleReturn(query);
    res.redirect(redirectUrl);
  }

  @Post('payos/webhook')
  @ApiExcludeEndpoint()
  payosWebhook(
    @Body() body: Record<string, unknown>,
  ): Promise<{ code: string; desc: string }> {
    return this.paymentsService.handlePayosWebhook(body ?? {});
  }

  @Get('mock/complete')
  @ApiExcludeEndpoint()
  async mockComplete(
    @Query('paymentId') paymentId: string,
    @Query('txnRef') txnRef: string,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.paymentsService.handleMockComplete(
      paymentId ?? '',
      txnRef ?? '',
    );
    res.redirect(redirectUrl);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiBearerAuth()
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiOperation({ summary: 'Get authoritative payment status' })
  @ApiOkResponse({ type: PaymentStatusDto })
  getStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentStatusDto> {
    return this.paymentsService.getStatus(this.requireUserId(req), id);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return auth.userId;
  }
}
