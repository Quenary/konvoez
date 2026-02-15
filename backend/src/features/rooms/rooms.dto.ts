import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsString, Length } from 'class-validator';
import { ERoomType } from '@common/enums';

export class CreateRoomDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(1, 64)
  name!: string;

  @ApiProperty({
    enum: ERoomType,
    required: true,
  })
  @IsEnum(ERoomType)
  type!: ERoomType;
}

export class UpdateRoomDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(1, 64)
  name!: string;
}

export class GetRoomDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(1, 64)
  name!: string;

  @ApiProperty({
    enum: ERoomType,
    required: true,
  })
  @IsEnum(ERoomType)
  type!: ERoomType;

  @ApiProperty({
    type: Date,
    required: true,
  })
  @IsDate()
  createdAt!: Date;

  @ApiProperty({
    type: Date,
    required: false,
  })
  @IsDate()
  updatedAt?: Date;
}
