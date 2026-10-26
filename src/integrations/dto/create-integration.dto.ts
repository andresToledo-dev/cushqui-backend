import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IntegrationType } from '@prisma/client';

export class CreateIntegrationDto {
  @ApiProperty({ example: 'iPhone Shortcut' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ enum: IntegrationType, example: IntegrationType.NOTIFICATION })
  @IsEnum(IntegrationType)
  type: IntegrationType;

  @ApiProperty({ example: 'revolut-account', required: false })
  @IsOptional()
  @IsString()
  accountId?: string;
}