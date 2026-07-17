import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuestionPriority } from '../question.entity';
import type { QuestionAskWhen } from '../question.entity';
import { SurveyQuestionDto } from './survey-response.dto';

export class AdminQuestionOptionInputDto {
  @ApiProperty()
  @IsString()
  labelCode!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  displayOrder!: number;
}

export class CreateSurveyQuestionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  text!: string;

  @ApiProperty()
  @IsString()
  questionType!: string;

  @ApiProperty({ minimum: 0 })
  @IsInt()
  @Min(0)
  displayOrder!: number;

  @ApiProperty({ enum: QuestionPriority })
  @IsEnum(QuestionPriority)
  priority!: QuestionPriority;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  category!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  intent?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  askWhen?: QuestionAskWhen;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [AdminQuestionOptionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminQuestionOptionInputDto)
  options!: AdminQuestionOptionInputDto[];
}

export class UpdateSurveyQuestionDto extends PartialType(
  OmitType(CreateSurveyQuestionDto, ['options'] as const),
) {}

export class ReplaceQuestionOptionsDto {
  @ApiProperty({ type: [AdminQuestionOptionInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdminQuestionOptionInputDto)
  options!: AdminQuestionOptionInputDto[];
}

export class AdminSurveyQuestionDto extends SurveyQuestionDto {
  @ApiPropertyOptional({ nullable: true })
  intent!: string | null;

  @ApiPropertyOptional({ type: Object, nullable: true })
  askWhen!: QuestionAskWhen | null;

  @ApiProperty()
  isActive!: boolean;
}
