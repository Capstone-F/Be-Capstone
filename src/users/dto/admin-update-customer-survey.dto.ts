import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class AdminAnswerInputDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  questionCode!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  labelCodes!: string[];
}

export class AdminUpdateCustomerSurveyDto {
  @ApiProperty({ type: [AdminAnswerInputDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdminAnswerInputDto)
  answers!: AdminAnswerInputDto[];
}
