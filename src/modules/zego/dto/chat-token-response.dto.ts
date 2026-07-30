import { ApiProperty } from '@nestjs/swagger';

export class ChatTokenResponseDto {
  @ApiProperty({ example: 123456 })
  appID!: number;

  @ApiProperty({ example: '04AAAA...' })
  token!: string;

  @ApiProperty({ example: '04AAAA...', required: false })
  peerToken?: string;

  @ApiProperty({ example: 'u_882' })
  userID!: string;

  @ApiProperty({ example: 'Nguyen Van A' })
  userName!: string;

  @ApiProperty({ example: 'u_119' })
  peerUserID!: string;

  @ApiProperty({ example: 'Dr. Tran B' })
  peerUserName!: string;
}
