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

  @ApiProperty({
    example: 'has enviado,has gastado',
    required: false,
    description: 'Required for NOTIFICATION (not allowed for MANUAL): comma-separated words that mark a message as an expense (max 5 phrases, 4 words per phrase, 15 characters per word)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  expenseWords?: string;

  @ApiProperty({
    example: 'has recibido,te ha enviado dinero',
    required: false,
    description: 'Required for NOTIFICATION (not allowed for MANUAL): comma-separated words that mark a message as an income (max 5 phrases, 4 words per phrase, 15 characters per word)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  incomeWords?: string;
}