import { IsString, IsOptional, IsDateString, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class NotificationImportDto {
  @ApiProperty({ example: "Has enviado 15.50€ a Juan Pablo. Llegará en segundos" })
  @IsString()
  @MaxLength(500)
  message: string;

  @ApiProperty({ example: "2026-10-02T12:00:00Z" })
  @IsDateString()
  date: string;

  @ApiProperty({ example: "ext-id-123", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  externalId?: string;
}