import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { EUserRole } from '@common/enums';
import {
  usernameMinLength,
  usernameMaxLength,
  passwordMaxLength,
  passwordMinLength,
  passwordRegexp,
} from '@common/const';

export class CreateUserDto {
  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(usernameMinLength, usernameMaxLength)
  username!: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(passwordMinLength, passwordMaxLength)
  password!: string;
}

export class UpdateUserDto {
  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  @Length(usernameMinLength, usernameMaxLength)
  username?: string;

  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  @Length(passwordMinLength, passwordMaxLength)
  password?: string;

  @ApiProperty({
    enum: EUserRole,
    required: false,
  })
  @IsEnum(EUserRole)
  role?: EUserRole;

  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  avatar?: string;
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
    type: String,
    required: false,
  })
  @IsString()
  avatar?: string;

  @ApiProperty({
    type: Date,
    required: true,
  })
  createdAt!: Date;

  @ApiProperty({
    type: Date,
    required: false,
  })
  updatedAt?: Date;
}
