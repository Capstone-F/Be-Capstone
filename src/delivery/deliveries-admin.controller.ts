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
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { DeliverySimulationProcessor } from './delivery-simulation.processor';
import { DeliveryService } from './delivery.service';
import { AdvanceDeliveryDto } from './dto/advance-delivery.dto';
import {
  AdvanceDeliveryResponseDto,
  CreateGhnOrderResponseDto,
  ForceDeliveryStatusResponseDto,
  PaginatedDeliveriesDto,
  TickDeliverySimulationResponseDto,
  DeliveryAdminResponseDto,
} from './dto/delivery-admin-response.dto';
import { ForceDeliveryStatusDto } from './dto/force-delivery-status.dto';
import { ListDeliveriesQueryDto } from './dto/list-deliveries-query.dto';
import { TickDeliverySimulationDto } from './dto/tick-delivery-simulation.dto';

@ApiTags('Admin deliveries')
@Controller('admin/deliveries')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Staff, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class DeliveriesAdminController {
  constructor(
    private readonly deliveryService: DeliveryService,
    private readonly processor: DeliverySimulationProcessor,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List deliveries (staff / admin)',
    description:
      'Paginated queue. Filter by status, orderId, missingProviderCode ' +
      '(PAID orders where GHN create failed / has not run), or awaitingHandover ' +
      '(PROCESSING with providerOrderCode but not yet handed to the carrier).',
  })
  @ApiOkResponse({ type: PaginatedDeliveriesDto })
  list(
    @Query() query: ListDeliveriesQueryDto,
  ): Promise<PaginatedDeliveriesDto> {
    return this.deliveryService.listForAdmin(query);
  }

  @Post('tick')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run one delivery-simulator pass now',
    description:
      'Does exactly what the cron tick would do. ignoreDelay defaults to true so a demo does not wait on the step delay.',
  })
  @ApiOkResponse({ type: TickDeliverySimulationResponseDto })
  tick(
    @Body() dto: TickDeliverySimulationDto,
  ): Promise<TickDeliverySimulationResponseDto> {
    return this.processor.tick({
      ignoreDelay: dto.ignoreDelay ?? true,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a delivery by id' })
  @ApiOkResponse({ type: DeliveryAdminResponseDto })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DeliveryAdminResponseDto> {
    return this.deliveryService.getForAdmin(id);
  }

  @Post(':id/advance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Advance one delivery along the happy path (demo)',
    description:
      'Pushes a single delivery forward through the simulated GHN sequence immediately, ' +
      'ignoring the step delay. Stops early at delivered or when the current status is off-sequence.',
  })
  @ApiOkResponse({ type: AdvanceDeliveryResponseDto })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async advance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdvanceDeliveryDto,
  ): Promise<AdvanceDeliveryResponseDto> {
    await this.deliveryService.getEntityById(id);
    const tick = await this.processor.tick({
      deliveryId: id,
      ignoreDelay: true,
      steps: dto.steps ?? 1,
    });
    const delivery = await this.deliveryService.getForAdmin(id);
    return { delivery, transitions: tick.advanced };
  }

  @Post(':id/force-status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Force a GHN provider status (demo / failure paths)',
    description:
      'Applies any key of GHN_STATUS_MAP immediately (e.g. returned, delivery_fail). ' +
      'A RETURNED delivery is later picked up by the order-cancellation sweep which creates a SYSTEM cancellation.',
  })
  @ApiOkResponse({ type: ForceDeliveryStatusResponseDto })
  @ApiBadRequestResponse({
    description: 'Unknown status or delivery has no providerOrderCode',
  })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async forceStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ForceDeliveryStatusDto,
  ): Promise<ForceDeliveryStatusResponseDto> {
    const result = await this.processor.forceStatus(
      id,
      dto.providerStatus,
      dto.note,
    );
    const delivery = await this.deliveryService.getForAdmin(id);
    return {
      delivery,
      applied: result.applied,
      deliveryStatus: result.deliveryStatus,
    };
  }

  @Post(':id/create-ghn-order')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Retry GHN order creation for a paid order',
    description:
      'Recovery path when IPN succeeded but GHN was down: re-runs createGhnOrderForPaidOrder. ' +
      'Idempotent — no-ops if providerOrderCode is already set.',
  })
  @ApiOkResponse({ type: CreateGhnOrderResponseDto })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async createGhnOrder(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreateGhnOrderResponseDto> {
    const before = await this.deliveryService.getEntityById(id);
    await this.deliveryService.createGhnOrderForPaidOrder(before.orderId);
    const delivery = await this.deliveryService.getForAdmin(id);
    return {
      delivery,
      created: Boolean(delivery.providerOrderCode),
    };
  }
}
