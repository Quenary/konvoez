import { PayloadTooLargeException } from '@nestjs/common';
import { maxAvatarSize } from '@konvoez/shared';
import { assertAvatarFileSize } from './file.service';

describe('assertAvatarFileSize', () => {
  it('allows a file at the size limit', () => {
    expect(() =>
      assertAvatarFileSize({ size: maxAvatarSize } as Express.Multer.File),
    ).not.toThrow();
  });

  it('rejects a file above the size limit', () => {
    expect(() =>
      assertAvatarFileSize({
        size: maxAvatarSize + 1,
      } as Express.Multer.File),
    ).toThrow(PayloadTooLargeException);
  });

  it('ignores a missing file', () => {
    expect(() => assertAvatarFileSize(undefined)).not.toThrow();
  });
});
