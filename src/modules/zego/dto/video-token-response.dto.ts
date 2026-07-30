import { ApiProperty } from '@nestjs/swagger';

export class VideoTokenResponseDto {
  @ApiProperty({ example: 123456 })
  appID!: number;

  @ApiProperty({ example: '04AAAA...' })
  token!: string;

  @ApiProperty({ example: 'consult_9f21...' })
  roomID!: string;

  @ApiProperty({ example: 'u_882' })
  userID!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  userName!: string;
}
