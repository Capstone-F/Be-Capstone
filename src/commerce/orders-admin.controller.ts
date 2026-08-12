import {
  Body,
  Controller,
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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
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
import { DeliveryAdminResponseDto } from '../delivery/dto/delivery-admin-response.dto';
import { DeliveryService } from '../delivery/delivery.service';
import { ConfirmHandoverDto } from './dto/confirm-handover.dto';

@ApiTags('Admin orders')
@Controller('admin/orders')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Staff, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class OrdersAdminController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Post(':orderId/handover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm parcel handed to the shipping provider',
    description:
      'Staff warehouse confirmation that the parcel was physically given to GHN. ' +
      'Stamps handedOverAt / handedOverByUserId, then applies GHN status `picked` ' +
      '(delivery → SHIPPED, order → SHIPPED) through the same path as webhooks. ' +
      'Requires a non-null providerOrderCode (create GHN order first if missing).',
  })
  @ApiOkResponse({ type: DeliveryAdminResponseDto })
  @ApiBadRequestResponse({
    description:
      'No providerOrderCode, or order/delivery is in a terminal / blocked status',
  })
  @ApiConflictResponse({ description: 'Order already handed over' })
  @ApiNotFoundResponse({ description: 'Delivery for order not found' })
  confirmHandover(
    @Req() req: Request,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body() dto: ConfirmHandoverDto,
  ): Promise<DeliveryAdminResponseDto> {
    return this.deliveryService.confirmHandoverToProvider(
      this.requireUserId(req),
      orderId,
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
