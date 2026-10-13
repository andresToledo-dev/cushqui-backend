import { ApiProperty } from '@nestjs/swagger';

export class DashboardResponseDto {
  @ApiProperty({ example: 2431.5 })
  totalBalance: number;

  @ApiProperty({ example: 1800.0 })
  monthlyIncome: number;

  @ApiProperty({ example: 850.3 })
  monthlyExpenses: number;

  @ApiProperty({ example: 4 })
  unclassifiedCount: number;
}