import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsString, Length } from 'class-validator';
import { EUserRole } from './users.enum';

export class CreateUserDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(1, 32)
  username!: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  @Length(12, 32)
  password!: string;
}

export class UpdateUserDto {
  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  @Length(1, 32)
  username?: string;

  @ApiProperty({
    type: String,
    required: false,
  })
  @Length(12, 32)
  password?: string;

  @ApiProperty({
    enum: EUserRole,
    required: false,
  })
  @IsEnum(EUserRole)
  role?: EUserRole;
}

export class GetUserDto {
  @ApiProperty({
    type: Number,
    required: true,
  })
  id!: number;

  @ApiProperty({
    type: String,
    required: true,
  })
  username!: string;

  @ApiProperty({
    enum: EUserRole,
    required: true,
  })
  role!: EUserRole;

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
