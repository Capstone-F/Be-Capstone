import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Ingredient } from './ingredient.entity';
import { IngredientsService } from './ingredients.service';

@ApiTags('Ingredients')
@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly ingredientsService: IngredientsService) {}

  @Get()
  @ApiOperation({ summary: 'List all available active ingredients' })
  @ApiOkResponse({ type: [Ingredient] })
  findAll(): Promise<Ingredient[]> {
    return this.ingredientsService.findAll();
  }
}
