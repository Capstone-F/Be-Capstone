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
import { AdvanceOrderCancellationDto } from './dto/advance-order-cancellation.dto';
import { ConfirmOrderReturnDto } from './dto/confirm-order-return.dto';
import { CreateOrderCancellationDto } from './dto/create-order-cancellation.dto';
import { ListOrderCancellationsQueryDto } from './dto/list-order-cancellations-query.dto';
import {
  AdvanceOrderCancellationResponseDto,
  OrderCancellationResponseDto,
  PaginatedOrderCancellationsDto,
  TickOrderCancellationsResponseDto,
} from './dto/order-cancellation-response.dto';
import { TickOrderCancellationsDto } from './dto/tick-order-cancellations.dto';
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
      'Creates a REQUESTED cancellation for any order that is not DELIVERED, CANCELLED, or REFUNDED. ' +
      'The processor (cron or POST …/advance) then refunds the wallet and parks stock at AWAITING_RETURN.',
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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Run one processor pass now',
    description:
      'Does exactly what the cron tick would do. ignoreDelay defaults to true so a demo does not wait on the step delay.',
  })
  @ApiOkResponse({ type: TickOrderCancellationsResponseDto })
  tick(
    @Body() dto: TickOrderCancellationsDto,
  ): Promise<TickOrderCancellationsResponseDto> {
    return this.processor.tick({
      ignoreDelay: dto.ignoreDelay ?? true,
    });
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

  @Post(':id/advance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Advance one cancellation (demo / unstick)',
    description:
      'Pushes a single cancellation forward immediately, ignoring nextRunAt. ' +
      'Stops early at AWAITING_RETURN (staff confirm-return is the only way past that gate) or a terminal status.',
  })
  @ApiOkResponse({ type: AdvanceOrderCancellationResponseDto })
  @ApiNotFoundResponse({ description: 'Cancellation not found' })
  async advance(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AdvanceOrderCancellationDto,
  ): Promise<AdvanceOrderCancellationResponseDto> {
    const tick = await this.processor.tick({
      cancellationId: id,
      ignoreDelay: true,
      steps: dto.steps ?? 1,
    });
    const cancellation = await this.cancellationsService.getById(id);
    return { cancellation, transitions: tick.advanced };
  }

  @Post(':id/confirm-return')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm physical restock into warehouse',
    description:
      'Allowed only while AWAITING_RETURN. Per order item, goodQuantity units return to ON_RACK ' +
      '(remainingQuantity incremented, RETURN movement) and damagedQuantity units go DAMAGED. ' +
      'goodQuantity + damagedQuantity must equal expectedQuantity for every item.',
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
