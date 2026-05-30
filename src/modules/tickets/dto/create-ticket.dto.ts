import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export const TicketCategoryValues = ['DEPOSIT', 'WITHDRAW', 'TRADE', 'ACCOUNT', 'OTHER'] as const;
export type TicketCategoryValue = (typeof TicketCategoryValues)[number];

export class CreateTicketDto {
  @ApiProperty({ example: 'Deposit not credited' })
  @IsString()
  @MinLength(3)
  @MaxLength(140)
  subject!: string;

  @ApiProperty({ enum: TicketCategoryValues })
  @IsEnum(TicketCategoryValues)
  category!: TicketCategoryValue;

  @ApiProperty({ example: 'I deposited 5000 yesterday but balance is unchanged.' })
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;
}

export class TicketMessageDto {
  @ApiProperty({ example: 'Any update on this?' })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message!: string;
}
