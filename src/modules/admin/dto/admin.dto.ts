import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AdjustWalletDto {
  @ApiProperty({ enum: ['ADMIN_CREDIT', 'ADMIN_DEBIT'] })
  @IsIn(['ADMIN_CREDIT', 'ADMIN_DEBIT'])
  type!: 'ADMIN_CREDIT' | 'ADMIN_DEBIT';

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class FreezeUserDto {
  @ApiProperty()
  @IsBoolean()
  frozen!: boolean;
}

export class RejectReasonDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class BankAccountDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  upiId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class TicketStatusDto {
  @ApiProperty({ enum: ['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] })
  @IsIn(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'])
  status!: 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
}

export class VisibilityDto {
  @ApiProperty()
  @IsBoolean()
  visible!: boolean;
}
