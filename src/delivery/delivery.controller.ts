import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { DeliveryService } from './delivery.service';
import { DeliveryOptionDto } from './dto/delivery-option.dto';

@ApiTags('Delivery')
@Controller('delivery')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('options')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'List priced delivery options',
    description:
      'Returns active providers and delivery types with feeVnd from the fixed fee matrix. ' +
      'Choose an option, then attach it to a PENDING order via POST /orders/:id/delivery.',
  })
  @ApiOkResponse({ type: [DeliveryOptionDto] })
  listOptions(): Promise<DeliveryOptionDto[]> {
    return this.deliveryService.listOptions();
  }
}
