import { ApiPropertyOptional } from '@nestjs/swagger';

/** Body for POST /auth/logout. */
export class LogoutPostDto {
  @ApiPropertyOptional({
    description:
      'Optional URL Auth0 should send the browser back to after logout. ' +
      'Must be same origin as FRONTEND_URL. ' +
      'When omitted, falls back to AUTH0_LOGOUT_RETURN_URL.',
    example: 'http://localhost:5173',
  })
  return_to?: string;
}
