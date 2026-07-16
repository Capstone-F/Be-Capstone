import {
  Body,
  Controller,
  Delete,
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
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartResponseDto } from './dto/cart-response.dto';

@ApiTags('Cart')
@Controller('cart')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Get the current cart' })
  @ApiOkResponse({ type: CartResponseDto })
  getCart(@Req() req: Request): Promise<CartResponseDto> {
    return this.cartService.getCart(this.requireUserId(req));
  }

  @Post('items')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Add or update a cart item' })
  @ApiOkResponse({ type: CartResponseDto })
  addItem(
    @Req() req: Request,
    @Body() body: AddCartItemDto,
  ): Promise<CartResponseDto> {
    return this.cartService.addItem(this.requireUserId(req), body);
  }

  @Delete('items/:variantId')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'Remove a cart item' })
  @ApiOkResponse({ type: CartResponseDto })
  removeItem(
    @Req() req: Request,
    @Param('variantId', ParseUUIDPipe) variantId: string,
  ): Promise<CartResponseDto> {
    return this.cartService.removeItem(this.requireUserId(req), variantId);
  }

  @Delete()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Clear the cart' })
  @ApiOkResponse({ type: CartResponseDto })
  clear(@Req() req: Request): Promise<CartResponseDto> {
    return this.cartService.clearCart(this.requireUserId(req));
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
