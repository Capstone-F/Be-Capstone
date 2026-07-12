import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class SubmitAnswerDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  questionId!: string;

  @ApiPropertyOptional({ example: 'Acne-prone and oily' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  value?: string;

  @ApiProperty({
    type: [String],
    example: ['ACNE_TREATMENT', 'OILY_SKIN'],
    description: 'Label codes attached to this answer',
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  labelCodes!: string[];
}

export class SubmitAnswersDto {
  @ApiProperty({ type: [SubmitAnswerDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmitAnswerDto)
  answers!: SubmitAnswerDto[];
}
