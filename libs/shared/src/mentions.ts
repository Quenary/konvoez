import * as z from 'zod';
import type {
  TMentionType,
  TUserNotificationSettings,
} from './schemas/notification.schemas';

export const MENTION_EVERYONE = '@everyone';

export function formatUserMention(id: number): string {
  return `<@${id}>`;
}

export function formatRoleMention(id: number): string {
  return `<@&${id}>`;
}

export const MENTION_TOKEN_RE =
  /<@(&)?([1-9]\d{0,9})>|(?<![\p{L}\p{N}_@])@everyone(?![\p{L}\p{N}_])/gu;

export function createMentionTokenRegex(): RegExp {
  return new RegExp(MENTION_TOKEN_RE.source, MENTION_TOKEN_RE.flags);
}

export type TMentionSegment =
  | { type: 'text'; value: string }
  | { type: 'user'; id: number }
  | { type: 'role'; id: number }
  | { type: 'everyone' };

export const mentionSetSchema = z.object({
  userIds: z.array(z.number().int().positive()).default([]),
  roleIds: z.array(z.number().int().positive()).default([]),
  everyone: z.boolean().default(false),
});

export type IMentionSet = z.infer<typeof mentionSetSchema>;

export function isMessageMentioningUser(
  mentions: IMentionSet | null | undefined,
  user:
    { id: number; roles?: readonly { id: number }[] | null } | null | undefined,
): boolean {
  if (!mentions || !user) {
    return false;
  }
  if (mentions.everyone) {
    return true;
  }
  if (mentions.userIds.includes(user.id)) {
    return true;
  }
  if (user.roles && user.roles.length > 0) {
    const roleIdSet = new Set(mentions.roleIds);
    return user.roles.some((r) => roleIdSet.has(r.id));
  }
  return false;
}

export function getMentionTypesForUser(
  mentions: IMentionSet | null | undefined,
  user:
    { id: number; roles?: readonly { id: number }[] | null } | null | undefined,
): TMentionType[] {
  if (!mentions || !user) {
    return [];
  }
  const types: TMentionType[] = [];
  if (mentions.userIds.includes(user.id)) {
    types.push('username');
  }
  if (user.roles && user.roles.length > 0) {
    const roleIdSet = new Set(mentions.roleIds);
    if (user.roles.some((r) => roleIdSet.has(r.id))) {
      types.push('role');
    }
  }
  if (mentions.everyone) {
    types.push('everyone');
  }
  return types;
}

export function shouldDeliverMentionNotification(
  settings: TUserNotificationSettings,
  types: readonly TMentionType[],
): boolean {
  return types.some((type) => settings.mentions[type]);
}

export function splitMentionSegments(text: string): TMentionSegment[] {
  if (!text) {
    return [];
  }

  const regex = createMentionTokenRegex();
  const segments: TMentionSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const textChunk = text.slice(lastIndex, match.index);
      const prev = segments[segments.length - 1];
      if (prev && prev.type === 'text') {
        prev.value += textChunk;
      } else {
        segments.push({ type: 'text', value: textChunk });
      }
    }

    if (match[2] !== undefined) {
      const id = parseInt(match[2], 10);
      if (match[1] === '&') {
        segments.push({ type: 'role', id });
      } else {
        segments.push({ type: 'user', id });
      }
    } else {
      segments.push({ type: 'everyone' });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    const textChunk = text.slice(lastIndex);
    const prev = segments[segments.length - 1];
    if (prev && prev.type === 'text') {
      prev.value += textChunk;
    } else {
      segments.push({ type: 'text', value: textChunk });
    }
  }

  return segments;
}

export function parseMentions(text: string): IMentionSet {
  const userIds = new Set<number>();
  const roleIds = new Set<number>();
  let everyone = false;

  const segments = splitMentionSegments(text);
  for (const seg of segments) {
    if (seg.type === 'user') {
      userIds.add(seg.id);
    } else if (seg.type === 'role') {
      roleIds.add(seg.id);
    } else if (seg.type === 'everyone') {
      everyone = true;
    }
  }

  return {
    userIds: Array.from(userIds).sort((a, b) => a - b),
    roleIds: Array.from(roleIds).sort((a, b) => a - b),
    everyone,
  };
}

export function diffMentionedUsers(
  prev: readonly number[],
  next: readonly number[],
): number[] {
  const prevSet = new Set(prev);
  const result: number[] = [];
  const seen = new Set<number>();

  for (const id of next) {
    if (!prevSet.has(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }

  return result;
}
