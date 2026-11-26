import * as z from 'zod';
import {
  baseEntitySchema,
  entityDeletedSchema,
  stringSchema,
} from './base.schemas';
import { emailSchema, fullnameSchema, usernameSchema } from './fields.schemas';
import { EPermission } from '../enums';
import { roleSummarySchema } from './role.schemas';

export const SUPPORTED_LANGUAGES = ['en', 'ru'] as const;
export const languageSchema = z.enum(SUPPORTED_LANGUAGES);
export type TLanguage = z.infer<typeof languageSchema>;
export const FALLBACK_LANGUAGE: TLanguage = 'en';
export const CLIENT_LANGUAGE_HEADER = 'x-konvoez-lang';

/** Complete user (includes email). Self/admin only. */
export const userFullSchema = baseEntitySchema.extend({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
  email: emailSchema,
  isOwner: z.boolean().default(false),
  roles: z.array(roleSummarySchema).default([]),
  permissions: z.array(z.nativeEnum(EPermission)).default([]),
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
  deletedAt: z.coerce.date().nullish(),
  twoFactorEnabled: z.boolean().default(false),
  emailVerified: z.boolean().default(false),
  pendingEmail: emailSchema.nullish(),
  language: languageSchema.nullish(),
  lastDetectedLocale: z.string().max(64).default(FALLBACK_LANGUAGE).optional(),
  lastSeenAt: z.coerce.date().nullish(),
  lastLoginAt: z.coerce.date().nullish(),
});

export type IUserFull = z.infer<typeof userFullSchema>;

/** Public user for general API/sockets/sync. Omit PII from full. */
export const userSafeSchema = userFullSchema.omit({
  email: true,
  twoFactorEnabled: true,
  emailVerified: true,
  pendingEmail: true,
  language: true,
  lastDetectedLocale: true,
  lastLoginAt: true,
});

export type IUserSafe = z.infer<typeof userSafeSchema>;

export const userBriefSchema = userFullSchema.pick({
  id: true,
  username: true,
  fullname: true,
});

export type IUserBrief = z.infer<typeof userBriefSchema>;

export const userDeletedSchema = entityDeletedSchema.clone();
export type IUserDeleted = z.infer<typeof userDeletedSchema>;
