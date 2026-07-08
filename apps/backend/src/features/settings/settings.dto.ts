import { SettingsCommon } from '@konvoez/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsJSON, IsOptional } from 'class-validator';

export class SettingsDto<
  T extends SettingsCommon.EKey,
> implements SettingsCommon.ISetting<T> {
  @ApiProperty({
    type: Number,
    required: true,
  })
  @IsInt()
  id: number;

  @ApiProperty({
    enum: SettingsCommon.EKey,
    required: true,
  })
  @IsEnum(SettingsCommon.EKey)
  key: T;

  @ApiProperty({
    type: String,
    description: 'Valid JSON',
    required: true,
  })
  @IsJSON()
  value: SettingsCommon.Type[T];

  @ApiProperty({
    type: Date,
    required: true,
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    type: Date,
    required: true,
  })
  @IsDate()
  @IsOptional()
  updatedAt: Date | null;
}

export class SettingsUpdateDto<
  T extends SettingsCommon.EKey,
> implements SettingsCommon.ISettingUpdate<T> {
  @ApiProperty({
    required: true,
  })
  value: SettingsCommon.Type[T];
}
