import { IsEmail, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvitationDto {
  @ApiProperty({
    example: 'friend@example.com',
    required: false,
    description: 'If set, only this email can register with the code',
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: 7, required: false, description: 'Days until the code expires (1-30, default 7)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}
