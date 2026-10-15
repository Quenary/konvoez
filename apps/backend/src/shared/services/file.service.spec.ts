import { ApiErrorCode, maxAvatarSize } from '@konvoez/shared';
import { AppException } from '@shared/errors/app.exception';
import {
  assertAvatarFileSize,
  FILE_BUCKETS,
  MESSAGE_ATTACHMENTS_BUCKET,
} from './file.service';

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
    ).toThrow(AppException);
    try {
      assertAvatarFileSize({ size: maxAvatarSize + 1 } as Express.Multer.File);
    } catch (e) {
      expect(e).toMatchObject({ code: ApiErrorCode.AVATAR_TOO_BIG });
    }
  });

  it('ignores a missing file', () => {
    expect(() => assertAvatarFileSize(undefined)).not.toThrow();
  });
});

describe('FILE_BUCKETS', () => {
  it('includes message attachments', () => {
    expect(FILE_BUCKETS).toContain(MESSAGE_ATTACHMENTS_BUCKET);
  });
});
