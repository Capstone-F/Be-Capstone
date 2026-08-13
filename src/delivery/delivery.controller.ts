import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
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
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { SessionGuard } from '../auth/guards/session.guard';
import { DeliveryService } from './delivery.service';
import { DeliveryResponseDto } from './dto/delivery-response.dto';
import { FeeQuoteRequestDto, FeeQuoteResponseDto } from './dto/fee-quote.dto';
import { GhnWebhookDto } from './dto/ghn-webhook.dto';
import { GhnDistrict, GhnProvince, GhnWard } from './ghn.types';

@ApiTags('Delivery')
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('provinces')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiOperation({ summary: 'List GHN provinces for the address picker' })
  getProvinces(): Promise<GhnProvince[]> {
    return this.deliveryService.getProvinces();
  }

  @Get('districts')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List GHN districts in a province' })
  getDistricts(
    @Query('provinceId', ParseIntPipe) provinceId: number,
  ): Promise<GhnDistrict[]> {
    return this.deliveryService.getDistricts(provinceId);
  }

  @Get('wards')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'List GHN wards in a district' })
  getWards(
    @Query('districtId', ParseIntPipe) districtId: number,
  ): Promise<GhnWard[]> {
    return this.deliveryService.getWards(districtId);
  }

  @Post('fee-quote')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Preview the GHN shipping fee for the current cart and an address',
    description:
      'Read-only. POST /orders re-quotes the fee server-side, so this is a display estimate.',
  })
  @ApiOkResponse({ type: FeeQuoteResponseDto })
  quote(
    @Req() req: Request,
    @Body() dto: FeeQuoteRequestDto,
  ): Promise<FeeQuoteResponseDto> {
    return this.deliveryService.quoteFeeForCart(
      this.requireUserId(req),
      dto.shippingAddress,
    );
  }

  /**
   * GHN status callback. Public: GHN does not sign its callbacks, so the shared secret
   * in the path is the only gate (compared in constant time by the service).
   *
   * Always answer 200 for anything handled or deliberately ignored — GHN retries 10
   * times, 5s apart, on any non-200. A genuine transient failure (DB down) should throw
   * and become a 500 so that retry is exactly what we want.
   */
  @Post('ghn/webhook/:secret')
  @ApiExcludeEndpoint()
  @HttpCode(HttpStatus.OK)
  async ghnWebhook(
    @Param('secret') secret: string,
    @Body() body: GhnWebhookDto,
    @Req() req: Request,
  ): Promise<{ message: string }> {
    // req.body is the untouched payload; `body` has non-declared fields stripped
    // by the global whitelist pipe, so the audit trail needs the raw one.
    await this.deliveryService.handleGhnWebhook(secret, body, req.body);
    return { message: 'OK' };
  }

  @Get('order/:orderId')
  @UseGuards(SessionGuard)
  @ApiCookieAuth()
  @ApiOperation({
    summary: 'Get the delivery and tracking history for one of my orders',
  })
  @ApiOkResponse({ type: DeliveryResponseDto })
  getByOrder(
    @Req() req: Request,
    @Param('orderId', ParseUUIDPipe) orderId: string,
  ): Promise<DeliveryResponseDto> {
    return this.deliveryService.getDeliveryForUser(
      this.requireUserId(req),
      orderId,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return auth.userId;
  }
}
