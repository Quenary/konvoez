import { Injectable } from '@angular/core';
import {
  ILocalFile,
  revokeLocalFiles,
} from '@features/text-room/outgoing/outgoing.types';

export type TChatKey = `room:${number}` | `dm:${number}`;

export function toChatKey(
  roomId: number | null,
  recipientId: number | null,
): TChatKey | null {
  if (roomId != null) {
    return `room:${roomId}`;
  }
  if (recipientId != null) {
    return `dm:${recipientId}`;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class ComposerDraftsService {
  take(_key: TChatKey): readonly ILocalFile[] {
    return [];
  }

  stash(_key: TChatKey, files: readonly ILocalFile[]): void {
    revokeLocalFiles(files);
  }
}
