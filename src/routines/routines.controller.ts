import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
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
import { GenerateRoutineDto } from './dto/generate-routine.dto';
import { RoutineResponseDto } from './dto/routine-response.dto';
import { RoutineGeneratorService } from './routine-generator.service';

@ApiTags('Routines')
@Controller('routines')
@UseGuards(SessionGuard, RolesGuard)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class RoutinesController {
  constructor(
    private readonly routineGeneratorService: RoutineGeneratorService,
  ) {}

  @Post('generate')
  @Roles(Role.Customer)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate an AI routine from a paid survey order',
    description:
      'Only PAID orders with source=SURVEY are eligible. Catalog purchases cannot generate routines.',
  })
  @ApiCreatedResponse({ type: RoutineResponseDto })
  generate(
    @Req() req: Request,
    @Body() body: GenerateRoutineDto,
  ): Promise<RoutineResponseDto> {
    return this.routineGeneratorService.generateForUser(
      this.requireUserId(req),
      body,
    );
  }

  @Get('me')
  @Roles(Role.Customer)
  @ApiOperation({ summary: 'List my routines' })
  @ApiOkResponse({ type: [RoutineResponseDto] })
  listMine(@Req() req: Request): Promise<RoutineResponseDto[]> {
    return this.routineGeneratorService.listMyRoutines(this.requireUserId(req));
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
