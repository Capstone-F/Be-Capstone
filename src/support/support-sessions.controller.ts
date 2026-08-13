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
import { CloseSupportSessionDto } from './dto/close-support-session.dto';
import { CreateSupportSessionDto } from './dto/create-support-session.dto';
import { ListSupportMessagesQueryDto } from './dto/list-support-messages-query.dto';
import { ListSupportSessionsQueryDto } from './dto/list-support-sessions-query.dto';
import { MarkSupportReadDto } from './dto/mark-support-read.dto';
import { SendSupportMessageDto } from './dto/send-support-message.dto';
import {
  SupportMessageResponseDto,
  SupportMessagesPageDto,
} from './dto/support-message-response.dto';
import {
  PaginatedSupportSessionsDto,
  SupportSessionResponseDto,
} from './dto/support-session-response.dto';
import { SupportService } from './support.service';

@ApiTags('Support sessions')
@Controller('support/sessions')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class SupportSessionsController {
  constructor(private readonly supportService: SupportService) {}

  @Post()
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a support session',
    description:
      'Customer opens a support session. If a live (OPEN/ACTIVE) session already exists, it is returned.',
  })
  @ApiCreatedResponse({ type: SupportSessionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  create(@Req() req: Request, @Body() body: CreateSupportSessionDto) {
    const { userId } = this.requireAuth(req);
    return this.supportService.create(userId, body);
  }

  @Get('me')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Get my live support session',
    description: 'Returns the current OPEN or ACTIVE session for the customer.',
  })
  @ApiOkResponse({ type: SupportSessionResponseDto })
  @ApiNotFoundResponse({ description: 'No live support session found' })
  getMe(@Req() req: Request) {
    const { userId } = this.requireAuth(req);
    return this.supportService.getMyLiveSession(userId);
  }

  @Get()
  @Roles(Role.Staff, Role.AppAdmin)
  @ApiOperation({
    summary: 'List support sessions (staff queue)',
    description:
      'Paginated shared queue for all staff. Filter by status and assignment.',
  })
  @ApiOkResponse({ type: PaginatedSupportSessionsDto })
  list(@Req() req: Request, @Query() query: ListSupportSessionsQueryDto) {
    const { userId } = this.requireAuth(req);
    return this.supportService.listForStaff(userId, query);
  }

  @Get(':id')
  @Roles(Role.Customer, Role.Staff, Role.AppAdmin)
  @ApiOperation({ summary: 'Get a support session by id' })
  @ApiOkResponse({ type: SupportSessionResponseDto })
  @ApiNotFoundResponse({ description: 'Session not found' })
  getById(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId, roles } = this.requireAuth(req);
    return this.supportService.getById(id, userId, roles);
  }

  @Post(':id/claim')
  @Roles(Role.Staff, Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Claim a support session',
    description:
      'Atomically assigns the OPEN session to the calling staff. Only one staff can claim a session.',
  })
  @ApiOkResponse({ type: SupportSessionResponseDto })
  @ApiConflictResponse({
    description: 'Session already handled by another staff',
  })
  @ApiNotFoundResponse({ description: 'Session not found' })
  claim(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    const { userId } = this.requireAuth(req);
    return this.supportService.claim(userId, id);
  }

  @Post(':id/messages')
  @Roles(Role.Customer, Role.Staff, Role.AppAdmin)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Send a message in a support session',
    description:
      'Customer may send while OPEN or ACTIVE. Staff may only send after claiming the session.',
  })
  @ApiCreatedResponse({ type: SupportMessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiConflictResponse({ description: 'Session is closed' })
  @ApiNotFoundResponse({ description: 'Session not found' })
  sendMessage(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SendSupportMessageDto,
  ) {
    const { userId, roles } = this.requireAuth(req);
    return this.supportService.sendMessage(id, userId, roles, body);
  }

  @Get(':id/messages')
  @Roles(Role.Customer, Role.Staff, Role.AppAdmin)
  @ApiOperation({
    summary: 'Poll messages in a support session',
    description:
      'Returns messages with seq greater than afterSeq, ascending by seq.',
  })
  @ApiOkResponse({ type: SupportMessagesPageDto })
  @ApiNotFoundResponse({ description: 'Session not found' })
  listMessages(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListSupportMessagesQueryDto,
  ) {
    const { userId, roles } = this.requireAuth(req);
    return this.supportService.listMessages(id, userId, roles, query);
  }

  @Post(':id/read')
  @Roles(Role.Customer, Role.Staff, Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark messages as read',
    description:
      'Advances customerLastReadSeq or staffLastReadSeq forward only (never backwards).',
  })
  @ApiOkResponse({ type: SupportSessionResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid lastReadSeq' })
  @ApiNotFoundResponse({ description: 'Session not found' })
  markRead(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MarkSupportReadDto,
  ) {
    const { userId, roles } = this.requireAuth(req);
    return this.supportService.markRead(id, userId, roles, body);
  }

  @Post(':id/close')
  @Roles(Role.Customer, Role.Staff, Role.AppAdmin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Close a support session',
    description:
      'Customer, assigned staff, or app admin can close. Frees the customer to open a new session.',
  })
  @ApiOkResponse({ type: SupportSessionResponseDto })
  @ApiNotFoundResponse({ description: 'Session not found' })
  close(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: CloseSupportSessionDto,
  ) {
    const { userId, roles } = this.requireAuth(req);
    return this.supportService.close(id, userId, roles, body);
  }

  private requireAuth(req: Request): { userId: string; roles: string[] } {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return { userId: auth.userId, roles: auth.roles ?? [] };
  }
}
