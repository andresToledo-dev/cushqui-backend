import { IsJWT, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  // The refresh token is a JWT signed with JWT_REFRESH_SECRET; AuthService.refreshTokens verifies
  // its signature and expiry. @IsJWT only rejects malformed values early.
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLWlkIn0.signature' })
  @IsString()
  @IsJWT()
  refreshToken: string;
}
