import {
  ESettingKey,
  ISetting,
  ISettingUpdate,
  TSettingValueMap,
} from '@konvoez/shared';
import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsEnum, IsInt, IsJSON, IsOptional } from 'class-validator';

export class SettingsDto<T extends ESettingKey> implements ISetting<T> {
  @ApiProperty({
    type: Number,
    required: true,
  })
  @IsInt()
  id!: number;

  @ApiProperty({
    enum: ESettingKey,
    required: true,
  })
  @IsEnum(ESettingKey)
  key!: T;

  @ApiProperty({
    type: String,
    description: 'Valid JSON',
    required: true,
  })
  @IsJSON()
  value!: TSettingValueMap[T];

  @ApiProperty({
    type: Date,
    required: true,
  })
  @IsDate()
  createdAt!: Date;

  @ApiProperty({
    type: Date,
    required: true,
  })
  @IsDate()
  @IsOptional()
  updatedAt: Date | null | undefined;
}

export class SettingsUpdateDto<T extends ESettingKey>
  implements ISettingUpdate<T>
{
  @ApiProperty({
    required: true,
  })
  value!: TSettingValueMap[T];
}
