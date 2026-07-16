import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { OrderResponseDto } from '../commerce/dto/order-response.dto';
import { DeliveryService } from './delivery.service';
import { AttachDeliveryDto } from './dto/attach-delivery.dto';
import { DeliveryResponseDto } from './dto/delivery-response.dto';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class OrderDeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post(':id/delivery')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Attach shipping to a PENDING order',
    description:
      'Locks shippingFeeVnd from the fee matrix, creates/updates the Delivery row, ' +
      'and recomputes totalVnd = subtotal − discount + shipping. ' +
      'Rejected if checkout has already started (in-flight payment).',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  attach(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AttachDeliveryDto,
  ): Promise<OrderResponseDto> {
    return this.deliveryService.attachToOrder(
      this.requireUserId(req),
      id,
      body,
    );
  }

  @Get(':id/delivery')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Get delivery for an order' })
  @ApiOkResponse({ type: DeliveryResponseDto })
  getOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryResponseDto> {
    return this.deliveryService.getForOrder(this.requireUserId(req), id);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
