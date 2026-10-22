import { describe, expect, it } from 'vitest';
import { EAttachmentKind } from '@konvoez/shared';
import {
  messageHasMedia,
  messageMediaFrame,
} from './message-media-frame.function';

describe('messageMediaFrame', () => {
  it('returns null without media', () => {
    const message = {
      attachments: [{ kind: EAttachmentKind.FILE, width: null, height: null }],
    };

    expect(messageHasMedia(message)).toBe(false);
    expect(messageMediaFrame(message)).toBeNull();
  });

  it('derives the frame from server attachment sizes', () => {
    const frame = messageMediaFrame({
      attachments: [{ kind: EAttachmentKind.IMAGE, width: 800, height: 400 }],
    });

    expect(frame?.width).toBe(800);
    expect(frame?.heightFactor).toBeGreaterThan(0);
  });

  it('prefers outgoing files over attachments', () => {
    const message = {
      attachments: [],
      outgoing: {
        files: [{ kind: EAttachmentKind.VIDEO, width: 640, height: 360 }],
      },
    };

    expect(messageHasMedia(message)).toBe(true);
    expect(messageMediaFrame(message)?.width).toBe(640);
  });

  it('returns null when any media item lacks dimensions', () => {
    expect(
      messageMediaFrame({
        attachments: [
          { kind: EAttachmentKind.IMAGE, width: 10, height: 10 },
          { kind: EAttachmentKind.IMAGE, width: null, height: 10 },
        ],
      }),
    ).toBeNull();
  });
});
