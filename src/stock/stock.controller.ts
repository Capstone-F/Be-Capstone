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
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { SessionGuard } from '../auth/guards/session.guard';
import { StockMovementType } from './enums';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ImportBatchDto } from './dto/import-batch.dto';
import { StockService } from './stock.service';

@ApiTags('Stock')
@Controller('stock')
@UseGuards(SessionGuard)
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Post('batches')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Import a stock batch',
    description:
      'Creates a new stock batch for a product with quantity and manufacturing date. ' +
      'Expiration date is computed from the product shelf life.',
  })
  @ApiCreatedResponse({ description: 'Stock batch created' })
  importBatch(@Body() dto: ImportBatchDto) {
    return this.stockService.createBatch({
      productId: dto.productId,
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
      'Sets the absolute remaining quantity for a batch and records an ADJUST movement. ' +
      'Requires an authenticated session (RBAC admin check planned for future).',
  })
  @ApiOkResponse({ description: 'Batch adjusted' })
  adjust(@Param('id') id: string, @Body() dto: AdjustStockDto) {
    // TODO: RBAC admin check
    return this.stockService.recordMovement(
      id,
      StockMovementType.ADJUST,
      dto.quantity,
      dto.note,
    );
  }
}
