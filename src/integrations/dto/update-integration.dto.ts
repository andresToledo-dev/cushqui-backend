import { IsBoolean, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateIntegrationDto {
  @ApiProperty({ example: 'iPhone Shortcut', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'revolut-account', required: false, nullable: true, description: 'null unlinks the account' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  accountId?: string | null;

  @ApiProperty({ example: 'has enviado,has gastado', required: false, description: 'NOTIFICATION only; cannot be empty' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  expenseWords?: string;

  @ApiProperty({ example: 'has recibido,te ha enviado dinero', required: false, description: 'NOTIFICATION only; cannot be empty' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  incomeWords?: string;
}
