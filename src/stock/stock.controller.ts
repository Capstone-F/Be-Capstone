import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { StockMovementType } from './enums';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ImportBatchDto } from './dto/import-batch.dto';
import { StockService } from './stock.service';

@ApiTags('Stock')
@Controller('stock')
@UseGuards(SessionGuard, RolesGuard)
@Roles(Role.AppAdmin, Role.Staff)
@ApiCookieAuth()
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Import a stock batch',
    description:
      'Creates a new stock batch for a product variant with quantity and manufacturing date. ' +
      'Expiration date is computed from the variant shelf life.',
  })
  @ApiCreatedResponse({ description: 'Stock batch created' })
  importBatch(@Body() dto: ImportBatchDto) {
    return this.stockService.createBatch({
      productVariantId: dto.productVariantId,
      quantity: dto.quantity,
      manufacturingDate: dto.manufacturingDate,
      batchCode: dto.batchCode,
    });
  }

  @Post('batches/:id/adjust')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Adjust batch stock quantity',
    description:
      'Sets the absolute remaining quantity for a batch and records an ADJUSTMENT movement. ' +
      'Requires role app_admin or staff.',
  })
  @ApiOkResponse({ description: 'Batch adjusted' })
  adjust(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    return this.stockService.recordMovement(
      id,
      StockMovementType.ADJUSTMENT,
      dto.quantity,
      dto.note,
    );
  }
}
