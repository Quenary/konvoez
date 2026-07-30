import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import {
  EUserRole,
  fullnameMaxLength,
  fullnameMinLength,
  IUser,
  IUserCreate,
  IUserUpdate,
} from '@konvoez/shared';
import {
  usernameMinLength,
  usernameMaxLength,
  passwordMaxLength,
  passwordMinLength,
} from '@konvoez/shared';

export class CreateUserDto implements IUserCreate {
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

  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(fullnameMinLength, fullnameMaxLength)
  fullname!: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  @IsEmail()
  email!: string;
}

export class UpdateUserDto implements IUserUpdate {
  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  @Length(usernameMinLength, usernameMaxLength)
  @IsOptional()
  username?: string;

  @ApiProperty({
    type: String,
    required: false,
  })
  @IsString()
  @Length(passwordMinLength, passwordMaxLength)
  @IsOptional()
  password?: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  @IsString()
  @Length(fullnameMinLength, fullnameMaxLength)
  @IsOptional()
  fullname?: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiProperty({
    enum: EUserRole,
    required: false,
  })
  @IsEnum(EUserRole)
  @IsOptional()
  role?: EUserRole;

  @ApiProperty({
    type: String,
    required: false,
    description: 'Avatar key in s3',
  })
  @IsString()
  @IsOptional()
  avatar?: string;
}

export class GetUserDto implements IUser {
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
    type: String,
    required: true,
  })
  fullname!: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  email!: string;

  @ApiProperty({
    enum: EUserRole,
    required: true,
  })
  role!: EUserRole;

  @ApiProperty({
    type: String,
    required: false,
  })
  avatar!: string | null | undefined;

  @ApiProperty({
    type: String,
    required: false,
  })
  avatarUrl: string | null | undefined;

  @ApiProperty({
    type: Date,
    required: true,
  })
  createdAt!: Date;

  @ApiProperty({
    type: Date,
    required: false,
  })
  updatedAt: Date | null | undefined;
}
