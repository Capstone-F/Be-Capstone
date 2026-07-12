import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
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
import { RecommendationResponseDto } from './dto/recommendation-response.dto';
import { RecommendationService } from './recommendation.service';

@ApiTags('Recommendations')
@Controller('recommendations')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class RecommendationsController {
  constructor(private readonly recommendationService: RecommendationService) {}

  @Get('latest')
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Get product recommendations for the latest completed survey',
    description:
      'Runs the rule engine against the latest completed survey, maps matched ' +
      'protocols to catalog products, and persists an immutable recommendation snapshot.',
  })
  @ApiOkResponse({ type: RecommendationResponseDto })
  getLatest(@Req() req: Request): Promise<RecommendationResponseDto> {
    return this.recommendationService.getLatestForUser(this.requireUserId(req));
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
