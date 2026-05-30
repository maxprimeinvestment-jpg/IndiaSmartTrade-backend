import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsPositive, IsString, IsUUID, IsUrl, Length, MaxLength } from 'class-validator';

export class CreateDepositDto {
  @ApiProperty()
  @IsUUID()
  bankAccountId!: string;

  @ApiProperty({ minimum: 1 })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ description: 'UTR / payment reference', minLength: 6 })
  @IsString()
  @Length(6, 64)
  utr!: string;

  @ApiProperty({ description: 'Screenshot URL from /upload/* response' })
  @IsString()
  @MaxLength(500)
  @IsUrl({ require_tld: false })
  screenshotUrl!: string;
}
