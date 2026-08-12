import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConfirmReturnItemDto {
  @ApiProperty()
  @IsUUID()
  orderItemId!: string;

  @ApiProperty({ minimum: 0, description: 'Units confirmed resellable' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  goodQuantity!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Units confirmed damaged (not restocked)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  damagedQuantity!: number;
}

export class ConfirmOrderReturnDto {
  @ApiProperty({ type: [ConfirmReturnItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmReturnItemDto)
  items!: ConfirmReturnItemDto[];

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
