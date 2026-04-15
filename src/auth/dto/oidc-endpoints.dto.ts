import { ApiProperty } from '@nestjs/swagger';

export class OidcEndpointsDto {
  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone' })
  issuer: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/auth' })
  authorizationEndpoint: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/token' })
  tokenEndpoint: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/userinfo' })
  userInfoEndpoint: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/certs' })
  jwksUri: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/logout' })
  logoutEndpoint: string;

  @ApiProperty({ example: 'http://localhost:8080/realms/be-capstone/protocol/openid-connect/token/introspect' })
  introspectionEndpoint: string;
}
