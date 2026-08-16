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
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { Role } from '../auth/roles.enum';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductCategoriesQueryDto } from './dto/list-product-categories.dto';
import { ListProductsQueryDto } from './dto/list-products.dto';
import { ProductCategoryResponseDto } from './dto/product-category-response.dto';
import {
  PaginatedProductsDto,
  ProductDetailResponseDto,
  ProductVariantResponseDto,
} from './dto/product-response.dto';
import {
  SuggestedProductsResponseDto,
  SuggestProductsQueryDto,
} from './dto/suggest-products.dto';
import { UpdateProductVariantImageDto } from './dto/update-product-variant-image.dto';
import { ProductOnboardingService } from './product-onboarding.service';
import { ProductsService } from './products.service';

@ApiTags('Products')
@Controller('products')
@ApiCookieAuth()
@ApiBearerAuth()
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

  @Patch('variants/:variantId')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.AppAdmin, Role.Staff)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update product variant image URL',
    description:
      'Sets imageUrl on a variant (typically after POST /uploads/images). Admin/Staff only.',
  })
  @ApiOkResponse({ type: ProductVariantResponseDto })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  @ApiNotFoundResponse({ description: 'Variant not found' })
  updateVariantImage(
    @Param('variantId', ParseUUIDPipe) variantId: string,
    @Body() body: UpdateProductVariantImageDto,
  ) {
    return this.productsService.updateVariantImage(variantId, body.imageUrl);
  }

  @Get()
  @UseGuards(SessionGuard, RolesGuard)
  @Public()
  @ApiOperation({
    summary: 'List products',
    description:
      'Filter by category, brand, or ingredient name. Use query for free-text search across product name, brand, category, description, ingredient, and SKU. Out-of-stock products are hidden unless the caller is Staff or Admin.',
  })
  @ApiOkResponse({ type: PaginatedProductsDto })
  list(@Req() req: Request, @Query() query: ListProductsQueryDto) {
    const auth = getAuthContext(req);
    const includeOutOfStock = (auth?.roles ?? []).some((role) =>
      [Role.Staff, Role.AppAdmin].includes(role as Role),
    );
    return this.productsService.findMany(query, { includeOutOfStock });
  }

  @Get('suggestion')
  @UseGuards(SessionGuard, RolesGuard)
  @Roles(Role.Customer)
  @ApiOperation({
    summary: 'Get suggested products for the authenticated customer',
    description:
      'Ranks active products using gender, age, skin type, and allergies from the customer profile. A completed survey is not required.',
  })
  @ApiOkResponse({ type: SuggestedProductsResponseDto })
  @ApiForbiddenResponse({
    description: 'Customer role or customer profile required',
  })
  suggest(
    @Req() req: Request,
    @Query() query: SuggestProductsQueryDto,
  ): Promise<SuggestedProductsResponseDto> {
    return this.productsService.suggestForUser(this.requireUserId(req), query);
  }

  @Get('categories')
  @ApiOperation({
    summary: 'List product categories',
    description:
      'Returns active product categories for catalog filters and onboarding.',
  })
  @ApiOkResponse({ type: [ProductCategoryResponseDto] })
  listCategories(@Query() query: ListProductCategoriesQueryDto) {
    return this.productsService.findCategories(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by id with ingredients' })
  @ApiOkResponse({ type: ProductDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Product not found' })
  getById(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  private requireUserId(req: Request): string {
    const auth = getAuthContext(req);
    if (!auth?.userId) {
      throw new UnauthorizedException('Chưa xác thực');
    }
    return auth.userId;
  }
}
