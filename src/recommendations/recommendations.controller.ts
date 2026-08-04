import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { getGuestToken, type SurveyActor } from '../auth/guest-token';
import { Role } from '../auth/roles.enum';
import { RecommendationResponseDto } from './dto/recommendation-response.dto';
import { RecommendationService } from './recommendation.service';

@ApiTags('Recommendations')
@Controller('recommendations')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class RecommendationsController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('latest')
  @Public()
  @Roles(Role.Customer)
  @ApiHeader({
    name: 'X-Guest-Token',
    required: false,
    description: 'Guest token from POST /surveys when not logged in',
  })
  @ApiOperation({
    summary: 'Get product recommendations for the latest completed survey',
    description:
      'Runs the rule engine against the latest completed survey, maps matched ' +
      'protocols to catalog products, and persists an immutable recommendation snapshot. ' +
      'Accepts session/Bearer or X-Guest-Token.',
  })
  @ApiOkResponse({ type: RecommendationResponseDto })
  getLatest(@Req() req: Request): Promise<RecommendationResponseDto> {
    return this.recommendationService.getLatestForActor(this.requireActor(req));
  }

  private requireActor(req: Request): SurveyActor {
    const userId = getAuthContext(req)?.userId;
    if (userId) {
      return { kind: 'user', userId };
    }
    const guestToken = getGuestToken(req);
    if (guestToken) {
      return { kind: 'guest', guestToken };
    }
    throw new UnauthorizedException(
      'Not authenticated. Log in or send X-Guest-Token',
    );
  }
}
