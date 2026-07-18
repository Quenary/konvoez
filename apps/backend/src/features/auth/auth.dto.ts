import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class AuthLoginDto {
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

export class AuthJWTData {
  type!: 'access' | 'refresh';
  userId!: number;
}
