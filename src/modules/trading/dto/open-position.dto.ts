import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class OpenPositionDto {
  @ApiProperty()
  @IsString()
  symbol!: string;

  @ApiProperty({ enum: ['BUY', 'SELL'] })
  @IsIn(['BUY', 'SELL'])
  side!: 'BUY' | 'SELL';

  @ApiProperty({ minimum: 0.01 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  lots!: number;

  @ApiProperty({ enum: [1, 5, 10, 20, 50, 100, 200, 400] })
  @Type(() => Number)
  @IsIn([1, 5, 10, 20, 50, 100, 200, 400])
  leverage!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stopLoss?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  takeProfit?: number;
}
