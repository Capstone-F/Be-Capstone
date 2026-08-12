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
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderResponseDto, PaginatedOrdersDto } from './dto/order-response.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OrderCancellationResponseDto } from './dto/order-cancellation-response.dto';
import { OrdersService } from './orders.service';
import { OrderCancellationsService } from './order-cancellations.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly cancellationsService: OrderCancellationsService,
  ) {}

  @Post()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a PENDING order from the current cart',
    description:
      'Requires a shipping address: the GHN fee is quoted from it, stored on the order, ' +
      'and included in totalVnd (which is what checkout charges). SURVEY carts validate ' +
      'recommended products and apply a combo discount when all recommended variants are ' +
      'included. CATALOG carts create a normal e-commerce order.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(
    @Req() req: Request,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.ordersService.createFromCart(this.requireUserId(req), dto);
  }

  @Get()
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'List my orders',
    description:
      'Returns orders for the authenticated customer, newest first. ' +
      'Supports pagination (page, limit) and optional status filter.',
  })
  @ApiOkResponse({ type: PaginatedOrdersDto })
  list(
    @Req() req: Request,
    @Query() query: ListOrdersQueryDto,
  ): Promise<PaginatedOrdersDto> {
    return this.ordersService.listForUser(this.requireUserId(req), query);
  }

  @Get(':id')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Get an order by id' })
  @ApiOkResponse({ type: OrderResponseDto })
  getOne(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponseDto> {
    return this.ordersService.getOrderForUser(this.requireUserId(req), id);
  }

  @Post(':id/cancel')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel my PENDING or PAID order',
    description:
      'Creates a cancellation. The processor then refunds the wallet (if paid) and parks sold stock for staff restock. ' +
      'Customers cannot cancel once the order is PROCESSING, SHIPPED, or DELIVERED.',
  })
  @ApiOkResponse({ type: OrderCancellationResponseDto })
  cancel(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderCancellationResponseDto> {
    return this.cancellationsService.requestByCustomer(
      this.requireUserId(req),
      id,
      dto.reason,
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
