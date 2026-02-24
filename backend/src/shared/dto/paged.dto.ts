import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, Min } from 'class-validator';
import { Paged } from '@common/paged';

export abstract class PagedRequestDto implements Paged.IRequest {
  @ApiProperty({ type: 'integer' })
  @IsInt()
  @Min(1)
  pageNumber!: number;

  @ApiProperty({
    type: 'integer',
  })
  @IsInt()
  @Min(1)
  pageSize!: number;
}

export abstract class PagedResponseDto<T> implements Paged.IResponse<T> {
  @ApiProperty({ type: 'array' })
  @IsArray()
  items!: T[];

  @ApiProperty({ type: 'integer' })
  @IsInt()
  totalElements!: number;

  @ApiProperty({ type: 'integer' })
  @IsInt()
  totalPages!: number;
}
