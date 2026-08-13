import {
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiForbiddenResponse,
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
import { ListUsersQueryDto } from './dto/list-users.dto';
import { PaginatedUsersDto } from './dto/user-response.dto';
import { CallerContext, UsersService } from './users.service';

@ApiTags('Admin Users')
@Controller('admin/users')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles(Role.AppAdmin)
  @ApiOperation({
    summary: 'List all users (app_admin)',
    description:
      'Support listing for admin tools (e.g. pick a userId for wallet top-up). ' +
      'Supports q, role, clinicId, page, limit. Equivalent to GET /users for app_admin.',
  })
  @ApiOkResponse({ type: PaginatedUsersDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  list(
    @Req() req: Request,
    @Query() query: ListUsersQueryDto,
  ): Promise<PaginatedUsersDto> {
    return this.usersService.listUsers(this.buildCallerContext(req), query);
  }

  private buildCallerContext(req: Request): CallerContext {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return {
      userId: auth.userId,
      roles: (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[],
      clinicId: auth.clinicId ?? null,
    };
  }
}
