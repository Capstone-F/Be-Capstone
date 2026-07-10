import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ExchangeMobileCodeDto {
  @ApiProperty({
    description: 'One-time mobile auth code from the deep-link callback',
    example: 'abc123...',
  })
  @IsString()
  @IsNotEmpty()
  code!: string;
}
