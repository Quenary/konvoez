import { describe, it, expect } from 'vitest';
import { canDeleteTextRoomMessage } from './text-room';
import { EPermission, EUserRole } from './enums';

describe('canDeleteTextRoomMessage', () => {
  const roomMessage = {
    senderId: 10,
    recipientId: null,
    roomId: 1,
  };

  const directMessage = {
    senderId: 10,
    recipientId: 20,
    roomId: null,
  };

  it('allows message author to delete own message in room or direct', () => {
    expect(
      canDeleteTextRoomMessage(roomMessage, { id: 10, isOwner: false }),
    ).toBe(true);
    expect(
      canDeleteTextRoomMessage(directMessage, { id: 10, isOwner: false }),
    ).toBe(true);
  });

  it('allows owner to delete other user message in room', () => {
    expect(
      canDeleteTextRoomMessage(roomMessage, { id: 99, isOwner: true }),
    ).toBe(true);
  });

  it('allows user with MODERATE_MESSAGES permission to delete other user message in room', () => {
    expect(
      canDeleteTextRoomMessage(roomMessage, {
        id: 99,
        isOwner: false,
        permissions: [EPermission.MODERATE_MESSAGES],
      }),
    ).toBe(true);
  });

  it('denies user without MODERATE_MESSAGES permission from deleting other user message in room', () => {
    expect(
      canDeleteTextRoomMessage(roomMessage, {
        id: 99,
        isOwner: false,
        permissions: [EPermission.SEND_MESSAGES],
      }),
    ).toBe(false);
  });

  it('does not allow deleting other user message in direct chat even if owner or moderator', () => {
    expect(
      canDeleteTextRoomMessage(directMessage, {
        id: 99,
        isOwner: true,
        permissions: [EPermission.MODERATE_MESSAGES],
      }),
    ).toBe(false);
  });

  it('still supports legacy EUserRole.OWNER and ADMIN', () => {
    expect(
      canDeleteTextRoomMessage(roomMessage, { id: 99, role: EUserRole.OWNER }),
    ).toBe(true);
    expect(
      canDeleteTextRoomMessage(roomMessage, { id: 99, role: EUserRole.ADMIN }),
    ).toBe(true);
    expect(
      canDeleteTextRoomMessage(roomMessage, { id: 99, role: EUserRole.MEMBER }),
    ).toBe(false);
  });
});
