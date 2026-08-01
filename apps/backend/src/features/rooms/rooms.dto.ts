import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { ERoomType } from '@konvoez/shared';

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

  @ApiProperty({
    type: String,
    required: false,
    description: 'Avatar key in s3',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class UpdateRoomDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(1, 64)
  name!: string;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Avatar key in s3',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class GetRoomDto {
  @ApiProperty({
    type: Number,
    required: true,
  })
  id!: number;

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
    type: String,
    required: false,
  })
  avatar!: string | null | undefined;

  @ApiProperty({
    type: String,
    required: false,
  })
  avatarUrl!: string | null | undefined;

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
  @IsOptional()
  updatedAt: Date | null | undefined;
}
