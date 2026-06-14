import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import {
  PaginatedProductsDto,
  ProductDetailResponseDto,
} from './dto/product-response.dto';
import { ProductOnboardingService } from './product-onboarding.service';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not authenticated' })
export class ProductsController {
  constructor(
    private readonly productOnboardingService: ProductOnboardingService,
    private readonly productsService: ProductsService,
  ) {}

  @Post()
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.AppAdmin, Role.Staff)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Onboard a new skincare product',
    description:
      'Creates a product and maps ingredients. Missing ingredients are auto-created within a transaction.',
  })
  @ApiCreatedResponse({ type: ProductDetailResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  onboard(@Body() body: CreateProductDto) {
    return this.productOnboardingService.onboard(body);
  }

  @Get()
  @UseGuards(SessionGuard)
  @ApiOperation({
    summary: 'List products',
    description: 'Filter by category, brand, or ingredient name.',
  })
  @ApiOkResponse({ type: PaginatedProductsDto })
  list(@Query() query: ListProductsQueryDto) {
    return this.productsService.findMany(query);
  }

  @Get(':id')
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: 'Get product by id with ingredients' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getById(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
