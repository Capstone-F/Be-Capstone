import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { getAuthContext } from '../auth/auth-context';
import { Public } from '../auth/decorators/public.decorator';
import { SessionGuard } from '../auth/guards/session.guard';
import { CommerceAnalyticsService } from './commerce-analytics.service';
import {
  CommerceAnalyticsBatchDto,
  CommerceAnalyticsBatchResponseDto,
} from './dto/commerce-analytics.dto';

@ApiTags('Commerce Analytics')
@Controller('analytics/commerce')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiBearerAuth()
export class CommerceAnalyticsController {
  constructor(private readonly analyticsService: CommerceAnalyticsService) {}

  @Post('events/batch')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record first-party ecommerce funnel events',
    description:
      'Accepts guest or authenticated traffic. PURCHASE_COMPLETED is server-only.',
  })
  @ApiOkResponse({ type: CommerceAnalyticsBatchResponseDto })
  async ingest(
    @Req() req: Request,
    @Body() dto: CommerceAnalyticsBatchDto,
  ): Promise<CommerceAnalyticsBatchResponseDto> {
    return {
      accepted: await this.analyticsService.ingestBatch(
        dto,
        getAuthContext(req)?.userId ?? null,
      ),
    };
  }
}
