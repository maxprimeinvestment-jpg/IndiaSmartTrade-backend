import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  bankName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  accountName!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(34)
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(15)
  ifsc!: string;
}
