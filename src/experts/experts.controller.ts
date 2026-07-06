import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionGuard } from '../auth/guards/session.guard';
import { ListExpertsQueryDto } from './dto/list-experts.dto';
import {
  ExpertResponseDto,
  PaginatedExpertsDto,
} from './dto/expert-response.dto';
import { ExpertsService } from './experts.service';

@ApiTags('Experts')
@Controller('experts')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ExpertsController {
  constructor(private readonly expertsService: ExpertsService) {}

  @Get()
  @ApiOperation({
    summary: 'List available experts',
    description:
      'Filter by specialization, rating, consultation fee, and distance from client location.',
  })
  @ApiOkResponse({ type: PaginatedExpertsDto })
  list(@Query() query: ListExpertsQueryDto) {
    return this.expertsService.findMany(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expert by id' })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  getById(@Param('id') id: string) {
    return this.expertsService.findOne(id);
  }
}
