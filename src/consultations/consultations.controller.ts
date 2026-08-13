import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { SessionGuard } from '../auth/guards/session.guard';
import { ChatTokenResponseDto } from '../modules/zego/dto/chat-token-response.dto';
import { VideoTokenResponseDto } from '../modules/zego/dto/video-token-response.dto';
import { ZegoTokenService } from '../modules/zego/zego-token.service';

@ApiTags('Consultations')
@Controller('consultations')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ConsultationsController {
  constructor(private readonly zegoTokenService: ZegoTokenService) {}

  @Get(':bookingId/video-token')
  @ApiOperation({
    summary: 'Get ZegoCloud video token for a consultation booking',
    description:
      'Returns a Token04 scoped to room consult_{bookingId}. Only the assigned customer or expert may call this.',
  })
  @ApiOkResponse({ type: VideoTokenResponseDto })
  @ApiForbiddenResponse({
    description: 'Caller is not the booking customer or expert',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  getVideoToken(
    @Req() req: Request,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<VideoTokenResponseDto> {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return this.zegoTokenService.generateVideoToken(auth.userId, bookingId);
  }

  @Get(':bookingId/chat-token')
  @ApiOperation({
    summary: 'Get ZegoCloud ZIM chat token for a consultation booking',
    description:
      'Returns a Token04 for in-app chat plus the peer user on this booking. ' +
      'Only the assigned customer or expert may call this. Access control is by revealing the correct peerUserID.',
  })
  @ApiOkResponse({ type: ChatTokenResponseDto })
  @ApiForbiddenResponse({
    description: 'Caller is not the booking customer or expert',
  })
  @ApiConflictResponse({
    description: 'Peer user cannot be resolved (e.g. no expert assigned yet)',
  })
  @ApiNotFoundResponse({ description: 'Booking not found' })
  getChatToken(
    @Req() req: Request,
    @Param('bookingId', ParseUUIDPipe) bookingId: string,
  ): Promise<ChatTokenResponseDto> {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return this.zegoTokenService.generateChatToken(auth.userId, bookingId);
  }
}
