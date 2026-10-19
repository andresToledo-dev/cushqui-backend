import { IsString, IsOptional, IsDateString, IsIn, IsNumber, Min, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { TransactionType } from "@prisma/client";

export class ManualImportDto {
  @ApiProperty({ enum: [TransactionType.EXPENSE, TransactionType.INCOME], example: TransactionType.EXPENSE })
  @IsIn([TransactionType.EXPENSE, TransactionType.INCOME])
  type: TransactionType;

  @ApiProperty({ example: 15.5, description: "Always positive; the sign comes from type" })
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: "revolut-account", required: false, description: "Send accountId or accountName, not both" })
  @IsOptional()
  @IsString()
  accountId?: string;

  @ApiProperty({ example: "Revolut", required: false, description: "Case-insensitive name of an active account" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountName?: string;

  @ApiProperty({ example: "2026-10-02T12:00:00Z", required: false, description: "Defaults to now" })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty({ example: "Cena con amigos", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  description?: string;

  @ApiProperty({ example: "ext-id-123", required: false, description: "Repeating it returns duplicate instead of creating" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;
}
