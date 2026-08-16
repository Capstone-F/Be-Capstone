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
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { ConfirmOrderReturnDto } from './dto/confirm-order-return.dto';
import { CreateOrderCancellationDto } from './dto/create-order-cancellation.dto';
import { ListOrderCancellationsQueryDto } from './dto/list-order-cancellations-query.dto';
import {
  OrderCancellationResponseDto,
  PaginatedOrderCancellationsDto,
  TickOrderCancellationsResponseDto,
} from './dto/order-cancellation-response.dto';
import { OrderCancellationProcessor } from './order-cancellation.processor';
import { OrderCancellationsService } from './order-cancellations.service';

@ApiTags('Order cancellations')
@Controller('admin/order-cancellations')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Staff, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class OrderCancellationsController {
  constructor(
    private readonly cancellationsService: OrderCancellationsService,
    private readonly processor: OrderCancellationProcessor,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Staff-initiated order cancellation',
    description:
      'Cancels any order that is not DELIVERED, CANCELLED, or REFUNDED — applied ' +
      'synchronously, no cron. Orders with deducted stock land directly in ' +
      'AWAITING_RETURN (refund happens at confirm-return); orders with nothing ' +
      'to return are refunded to the wallet inline and COMPLETED.',
  })
  @ApiCreatedResponse({ type: OrderCancellationResponseDto })
  @ApiBadRequestResponse({ description: 'Order is not cancellable' })
  @ApiConflictResponse({ description: 'Order already has a cancellation' })
  @ApiNotFoundResponse({ description: 'Order not found' })
  create(
    @Req() req: Request,
    @Body() dto: CreateOrderCancellationDto,
  ): Promise<OrderCancellationResponseDto> {
    return this.cancellationsService.requestByStaff(
      this.requireUserId(req),
      dto.orderId,
      dto.reason,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List order cancellations',
    description:
      'Paginated staff queue. Filter by status; AWAITING_RETURN is the restock work queue.',
  })
  @ApiOkResponse({ type: PaginatedOrderCancellationsDto })
  list(
    @Query() query: ListOrderCancellationsQueryDto,
  ): Promise<PaginatedOrderCancellationsDto> {
    return this.cancellationsService.list(query);
  }

  @Post('tick')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sweep RETURNED deliveries now',
    description:
      'Auto-creates SYSTEM cancellations for deliveries that came back RETURNED. ' +
      'Cancellations themselves apply synchronously, so there is no pipeline to advance.',
  })
  @ApiOkResponse({ type: TickOrderCancellationsResponseDto })
  tick(): Promise<TickOrderCancellationsResponseDto> {
    return this.processor.tick();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an order cancellation by id' })
  @ApiOkResponse({ type: OrderCancellationResponseDto })
  @ApiNotFoundResponse({ description: 'Cancellation not found' })
  getById(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderCancellationResponseDto> {
    return this.cancellationsService.getById(id);
  }

  @Post(':id/confirm-return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm physical restock into warehouse',
    description:
      'Allowed only while AWAITING_RETURN. Per order item, goodQuantity units return to ON_RACK ' +
      '(remainingQuantity incremented, RETURN movement) and damagedQuantity units go DAMAGED. ' +
      'goodQuantity + damagedQuantity must equal expectedQuantity for every item. ' +
      'On success the wallet refund is credited in the same transaction and the cancellation is COMPLETED.',
  })
  @ApiOkResponse({ type: OrderCancellationResponseDto })
  @ApiBadRequestResponse({
    description:
      'Not AWAITING_RETURN, or quantities do not match expectedQuantity',
  })
  @ApiNotFoundResponse({ description: 'Cancellation not found' })
  confirmReturn(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmOrderReturnDto,
  ): Promise<OrderCancellationResponseDto> {
    return this.cancellationsService.confirmReturn(
      this.requireUserId(req),
      id,
      dto,
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
