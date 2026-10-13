import { IsString, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ example: 'uuid-of-refresh-token' })
  @IsString()
  @IsUUID()
  refreshToken: string;
}