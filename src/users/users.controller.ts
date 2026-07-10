import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/roles.enum';
import { getAuthContext } from '../auth/auth-context';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersQueryDto } from './dto/list-users.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { PaginatedUsersDto, UserResponseDto } from './dto/user-response.dto';
import { CallerContext, UsersService } from './users.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary: 'Get own profile',
    description:
      'Canonical endpoint for the authenticated user profile (roles, clinicId, etc.).',
  })
  @ApiOkResponse({ type: UserResponseDto })
  async getMe(@Req() req: Request) {
    const userId = this.requireUserId(req);
    return this.usersService.getOwnProfile(userId);
  }

  @Patch('me')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update own profile' })
  @ApiOkResponse({ type: UserResponseDto })
  async updateMe(@Req() req: Request, @Body() body: UpdateProfileDto) {
    const userId = this.requireUserId(req);
    return this.usersService.updateOwnProfile(userId, body.name);
  }

  @Get()
  @Roles(Role.AppAdmin, Role.Staff, Role.ClinicManager)
  @ApiOperation({
    summary: 'List users',
    description:
      'app_admin and staff see all users; clinic_manager is scoped to their clinic.',
  })
  @ApiOkResponse({ type: PaginatedUsersDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async list(@Req() req: Request, @Query() query: ListUsersQueryDto) {
    const caller = this.buildCallerContext(req);
    return this.usersService.listUsers(caller, query);
  }

  @Get(':id')
  @Roles(Role.AppAdmin, Role.Staff, Role.ClinicManager)
  @ApiOperation({ summary: 'Get user by id' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getById(@Req() req: Request, @Param('id') id: string) {
    const caller = this.buildCallerContext(req);
    return this.usersService.getByIdForCaller(caller, id);
  }

  @Post()
  @Roles(Role.AppAdmin, Role.ClinicManager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create managed user account',
    description:
      'app_admin can create staff, expert, clinic_manager. clinic_manager can create expert in their clinic only.',
  })
  @ApiCreatedResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async create(@Req() req: Request, @Body() body: CreateUserDto) {
    const caller = this.buildCallerContext(req);
    return this.usersService.createManagedUser(caller, {
      email: body.email,
      name: body.name,
      role: body.role,
      clinicId: body.clinicId,
      temporaryPassword: body.temporaryPassword,
    });
  }

  @Patch(':id/roles')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Replace user application roles (app_admin only)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async assignRoles(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: AssignRolesDto,
  ) {
    const caller = this.buildCallerContext(req);
    return this.usersService.assignRoles(caller, id, body.roles);
  }

  @Patch(':id/status')
  @Roles(Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable or disable user (app_admin only)' })
  @ApiOkResponse({ type: UserResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async updateStatus(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateStatusDto,
  ) {
    const caller = this.buildCallerContext(req);
    if (typeof body.isActive !== 'boolean') {
      throw new BadRequestException('isActive must be a boolean');
    }
    return this.usersService.setStatus(caller, id, body.isActive);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }

  private buildCallerContext(req: Request): CallerContext {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return {
      userId: auth.userId,
      roles: (auth.roles?.length ? auth.roles : [Role.Customer]) as Role[],
      clinicId: auth.clinicId ?? null,
    };
  }
}
