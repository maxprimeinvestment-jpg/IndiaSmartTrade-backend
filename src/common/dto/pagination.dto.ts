import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}

export type Paginated<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export function paginated<T>(data: T[], page: number, limit: number, total: number): Paginated<T> {
  return { data, page, limit, total, hasMore: page * limit < total };
}
