import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TimeOfUse } from '../../ingredients/enums';

export class RuleEngineLabelDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'OILY_SKIN' })
  code!: string;

  @ApiProperty({ example: 'Oily Skin' })
  name!: string;

  @ApiPropertyOptional({
    example: 'Skin produces excess sebum',
    nullable: true,
  })
  description!: string | null;

  @ApiProperty({ example: 'uuid' })
  categoryId!: string;
}

export class RuleEngineProtocolDto {
  @ApiProperty({ example: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'BHA_2PCT_PM' })
  code!: string;

  @ApiProperty({ example: 'BHA 2% Evening Protocol' })
  name!: string;

  @ApiProperty({ example: 'Salicylic Acid' })
  ingredientName!: string;

  @ApiPropertyOptional({ example: 2.0, nullable: true })
  concentrationPct!: number | null;

  @ApiPropertyOptional({ example: 3.5, nullable: true })
  timePerWeek!: number | null;

  @ApiPropertyOptional({ enum: TimeOfUse, nullable: true })
  timeOfUse!: TimeOfUse | null;

  @ApiPropertyOptional({ example: 8, nullable: true })
  durationWeeks!: number | null;

  @ApiPropertyOptional({ nullable: true })
  instructions!: string | null;

  @ApiProperty({ example: 2 })
  matchScore!: number;

  @ApiProperty({ example: ['OILY_SKIN', 'ACNE_PRONE'] })
  matchedLabelCodes!: string[];
}

export class RuleEngineContextDto {
  @ApiProperty({ type: [RuleEngineLabelDto] })
  labels!: RuleEngineLabelDto[];

  @ApiProperty({ type: [RuleEngineProtocolDto] })
  protocols!: RuleEngineProtocolDto[];
}
