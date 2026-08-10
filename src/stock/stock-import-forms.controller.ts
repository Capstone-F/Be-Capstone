import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
import { getAuthContext } from '../auth/auth-context';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import {
  CreateStockImportFormDto,
  UpdateStockImportFormDto,
} from './dto/create-stock-import-form.dto';
import { ListStockImportFormsQueryDto } from './dto/list-stock-import-forms-query.dto';
import { RejectStockImportFormDto } from './dto/reject-stock-import-form.dto';
import {
  PaginatedStockImportFormsDto,
  StockImportFormResponseDto,
} from './dto/stock-import-form-response.dto';
import { StockImportFormsService } from './stock-import-forms.service';

@ApiTags('Stock import forms')
@Controller('stock/import-forms')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.Staff, Role.AppAdmin)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class StockImportFormsController {
  constructor(
    private readonly stockImportFormsService: StockImportFormsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a stock import form (DRAFT)',
    description:
      'Staff/AppAdmin creates a draft import form for a single product variant batch. ' +
      'Submit then confirm to apply inventory.',
  })
  @ApiCreatedResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiNotFoundResponse({ description: 'Product variant not found' })
  create(@Req() req: Request, @Body() body: CreateStockImportFormDto) {
    return this.stockImportFormsService.create(this.requireUserId(req), body);
  }

  @Get()
  @ApiOperation({
    summary: 'List stock import forms',
    description:
      'Paginated list with optional filters: status, productVariantId, createdByUserId.',
  })
  @ApiOkResponse({ type: PaginatedStockImportFormsDto })
  list(@Query() query: ListStockImportFormsQueryDto) {
    return this.stockImportFormsService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a stock import form by id' })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiNotFoundResponse({ description: 'Form not found' })
  getById(@Param('id', ParseUUIDPipe) id: string) {
    return this.stockImportFormsService.getById(id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update stock import form line fields',
    description:
      'Allowed only while DRAFT or SUBMITTED. Status is unchanged. ' +
      'At least one of productVariantId, quantity, manufacturingDate, batchCode is required.',
  })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid body or form not editable in current status',
  })
  @ApiNotFoundResponse({ description: 'Form or variant not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateStockImportFormDto,
  ) {
    return this.stockImportFormsService.update(id, body);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit a stock import form',
    description: 'Transitions DRAFT → SUBMITTED.',
  })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({ description: 'Form is not DRAFT' })
  @ApiNotFoundResponse({ description: 'Form not found' })
  submit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockImportFormsService.submit(this.requireUserId(req), id);
  }

  @Patch(':id/confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm a stock import form',
    description:
      'Transitions SUBMITTED → CONFIRMED and creates the stock batch ' +
      '(IMPORT movement + ON_RACK product instances) in the same transaction.',
  })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({ description: 'Form is not SUBMITTED' })
  @ApiNotFoundResponse({ description: 'Form not found' })
  confirm(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockImportFormsService.confirm(this.requireUserId(req), id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a stock import form',
    description:
      'Transitions DRAFT or SUBMITTED → CANCELLED. No stock applied.',
  })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({ description: 'Form is not cancellable' })
  @ApiNotFoundResponse({ description: 'Form not found' })
  cancel(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) {
    return this.stockImportFormsService.cancel(this.requireUserId(req), id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a submitted stock import form',
    description:
      'Transitions SUBMITTED → REJECTED. Optional reason. No stock applied.',
  })
  @ApiOkResponse({ type: StockImportFormResponseDto })
  @ApiBadRequestResponse({ description: 'Form is not SUBMITTED' })
  @ApiNotFoundResponse({ description: 'Form not found' })
  reject(
    @Req() req: Request,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectStockImportFormDto,
  ) {
    return this.stockImportFormsService.reject(
      this.requireUserId(req),
      id,
      body.reason,
    );
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Not authenticated');
    }
    return auth.userId;
  }
}
