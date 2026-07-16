import {
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
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrderResponseDto, PaginatedOrdersDto } from './dto/order-response.dto';
import { OrdersService } from './orders.service';

@ApiTags('Orders')
@Controller('orders')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a PENDING order from the current cart',
    description:
      'SURVEY carts validate recommended products and apply a combo discount when all ' +
      'recommended variants are included. CATALOG carts create a normal e-commerce order.',
  })
  @ApiCreatedResponse({ type: OrderResponseDto })
  create(@Req() req: Request): Promise<OrderResponseDto> {
    return this.ordersService.createFromCart(this.requireUserId(req));
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

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
