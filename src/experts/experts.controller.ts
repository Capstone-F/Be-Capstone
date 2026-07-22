import {
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
import { Roles } from '../auth/decorators/roles.decorator';
import { getAuthContext } from '../auth/auth-context';
import { SessionGuard } from '../auth/guards/session.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Role } from '../auth/roles.enum';
import { CallerContext } from '../users/users.service';
import { CreateExpertDto } from './dto/create-expert.dto';
import { UpdateExpertDto } from './dto/update-expert.dto';
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
@ApiBearerAuth()
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

  @Post()
  @UseGuards(RolesGuard)
  @Roles(Role.AppAdmin, Role.ClinicManager)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create expert profile',
    description:
      'Creates a clinic-bound expert profile for an existing user with the expert role. clinicId is required.',
  })
  @ApiCreatedResponse({ type: ExpertResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiConflictResponse({ description: 'Expert profile already exists' })
  @ApiNotFoundResponse({ description: 'User or clinic not found' })
  create(@Req() req: Request, @Body() body: CreateExpertDto) {
    return this.expertsService.create(this.buildCallerContext(req), body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get expert by id' })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  getById(@Param('id') id: string) {
    return this.expertsService.findOne(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles(Role.AppAdmin, Role.ClinicManager)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update expert profile',
    description:
      'Updates expert profile fields. clinicId cannot be cleared; activation requires a clinic.',
  })
  @ApiOkResponse({ type: ExpertResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Expert not found' })
  update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() body: UpdateExpertDto,
  ) {
    return this.expertsService.update(this.buildCallerContext(req), id, body);
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
