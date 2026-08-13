import {
  Body,
  Controller,
  Get,
  Patch,
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
import {
  ComboDiscountSettingDto,
  UpdateComboDiscountDto,
} from './dto/commerce-setting.dto';
import { OrdersService } from './orders.service';

@ApiTags('Admin Commerce Settings')
@Controller('admin/commerce-settings')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class CommerceSettingsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('survey-combo-discount')
  @Roles(Role.AppAdmin)
  @ApiOperation({
    summary: 'Get survey combo discount percent and minimum subtotal',
  })
  @ApiOkResponse({ type: ComboDiscountSettingDto })
  getComboDiscount(): Promise<ComboDiscountSettingDto> {
    return this.ordersService.getComboDiscountSetting();
  }

  @Patch('survey-combo-discount')
  @Roles(Role.AppAdmin)
  @ApiOperation({
    summary: 'Update survey combo discount percent and/or minimum subtotal',
  })
  @ApiOkResponse({ type: ComboDiscountSettingDto })
  updateComboDiscount(
    @Req() req: Request,
    @Body() body: UpdateComboDiscountDto,
  ): Promise<ComboDiscountSettingDto> {
    return this.ordersService.updateComboDiscountSetting(
      this.requireUserId(req),
      body,
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
