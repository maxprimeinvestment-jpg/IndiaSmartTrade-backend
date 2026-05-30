import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAdminDto {
  @ApiProperty({
    description:
      'Shared bootstrap secret. Must match the ADMIN_SETUP_SECRET env var on the server, otherwise the request is rejected.',
    example: 'a-long-random-bootstrap-secret',
  })
  @IsString()
  setupSecret!: string;

  @ApiProperty({ example: 'admin@indiasmarttrade.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass1', minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, {
    message: 'Password must contain at least one letter and one number',
  })
  password!: string;

  @ApiProperty({ example: 'Site Admin' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiProperty({ required: false, example: '+919876543210' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({
    required: false,
    enum: ['ADMIN', 'SUPER_ADMIN'],
    default: 'SUPER_ADMIN',
  })
  @IsOptional()
  @IsIn(['ADMIN', 'SUPER_ADMIN'])
  role?: 'ADMIN' | 'SUPER_ADMIN';
}
