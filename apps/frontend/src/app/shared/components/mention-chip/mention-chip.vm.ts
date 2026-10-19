import {
  IMentionSet,
  IRoleSummary,
  IUser,
  MENTION_EVERYONE,
} from '@konvoez/shared';

export type TMentionAvatarVm =
  | {
      kind: 'user';
      username: string;
      fullname: string;
      avatarUrl: string | null;
    }
  | { kind: 'role'; name: string; color: string | null }
  | { kind: 'everyone' }
  | { kind: 'unknown' };

export interface IMentionChipVm {
  kind: 'user' | 'role' | 'everyone' | 'unknown';
  id: number | null;
  label: string;
  isMe: boolean;
  appearance: 'info' | 'neutral';
  avatar: TMentionAvatarVm;
}

export interface IMentionChipContext {
  usersById: Record<number, IUser>;
  rolesById: Record<number, IRoleSummary>;
  me: IUser | null;
  unknownLabel: string;
  accepted: IMentionSet | null;
}

export function buildMentionChipVm(
  segment: { kind: string; id?: number | null },
  ctx: IMentionChipContext,
): IMentionChipVm {
  const kind = segment.kind;
  const id = segment.id ?? null;

  if (kind === 'user' && id !== null) {
    const user = ctx.usersById[id];
    if (user) {
      const isMe =
        ctx.me?.id === user.id &&
        (ctx.accepted === null || ctx.accepted.userIds.includes(user.id));
      return {
        kind: 'user',
        id: user.id,
        label: `@${user.username}`,
        isMe,
        appearance: isMe ? 'info' : 'neutral',
        avatar: {
          kind: 'user',
          username: user.username,
          fullname: user.fullname,
          avatarUrl: user.avatarUrl ?? null,
        },
      };
    }
  } else if (kind === 'role' && id !== null) {
    const role = ctx.rolesById[id];
    if (role) {
      const isMe =
        (ctx.me?.roles?.some((r) => r.id === role.id) ?? false) &&
        (ctx.accepted === null || ctx.accepted.roleIds.includes(role.id));
      return {
        kind: 'role',
        id: role.id,
        label: `@${role.name}`,
        isMe,
        appearance: isMe ? 'info' : 'neutral',
        avatar: {
          kind: 'role',
          name: role.name,
          color: role.color ?? null,
        },
      };
    }
  } else if (kind === 'everyone') {
    const isMe =
      ctx.me !== null && (ctx.accepted === null || ctx.accepted.everyone);
    return {
      kind: 'everyone',
      id: null,
      label: MENTION_EVERYONE,
      isMe,
      appearance: isMe ? 'info' : 'neutral',
      avatar: {
        kind: 'everyone',
      },
    };
  }

  return {
    kind: 'unknown',
    id,
    label: `@${ctx.unknownLabel}`,
    isMe: false,
    appearance: 'neutral',
    avatar: {
      kind: 'unknown',
    },
  };
}
