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
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiExcludeEndpoint,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { ReturnQueryFromVNPay } from 'vnpay';
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
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiOperation({
    summary: 'Create a VNPay payment for a pending order',
    description:
      'Creates (or reuses) a Payment for the order and returns the VNPay payment URL to redirect the customer to.',
  })
  @ApiOkResponse({ type: CheckoutResponseDto })
  checkout(
    @Req() req: Request,
    @Body() dto: CheckoutDto,
  ): Promise<CheckoutResponseDto> {
    return this.paymentsService.checkout(
      req.session.userId as string,
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

  @Get(':id')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiOperation({ summary: 'Get authoritative payment status' })
  @ApiOkResponse({ type: PaymentStatusDto })
  getStatus(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PaymentStatusDto> {
    return this.paymentsService.getStatus(req.session.userId as string, id);
  }
}
