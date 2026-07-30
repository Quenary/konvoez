import { ApiProperty } from '@nestjs/swagger';
import { IUploadFileResult } from '@konvoez/shared';

export class UploadFileResultDto implements IUploadFileResult {
  @ApiProperty({
    type: String,
    required: true,
  })
  key!: string;

  @ApiProperty({
    type: String,
    required: true,
  })
  url!: string;
}
