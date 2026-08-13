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
import { EscrowService } from './escrow.service';
import {
  PlatformCommissionSettingDto,
  UpdatePlatformCommissionDto,
} from './dto/platform-commission.dto';

@ApiTags('Admin Commerce Settings')
@Controller('admin/commerce-settings')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class PlatformCommissionController {
  constructor(private readonly escrowService: EscrowService) {}

  @Get('platform-commission')
  @Roles(Role.AppAdmin)
  @ApiOperation({ summary: 'Get platform commission percent' })
  @ApiOkResponse({ type: PlatformCommissionSettingDto })
  async get(): Promise<PlatformCommissionSettingDto> {
    const percent = await this.escrowService.getPlatformCommissionPct();
    return { percent };
  }

  @Patch('platform-commission')
  @Roles(Role.AppAdmin)
  @ApiOperation({ summary: 'Update platform commission percent' })
  @ApiOkResponse({ type: PlatformCommissionSettingDto })
  async update(
    @Req() req: Request,
    @Body() dto: UpdatePlatformCommissionDto,
  ): Promise<PlatformCommissionSettingDto> {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    const percent = await this.escrowService.updatePlatformCommissionPct(
      auth.userId,
      dto.percent,
    );
    return { percent };
  }
}
