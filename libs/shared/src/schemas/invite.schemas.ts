import { z } from 'zod';
import { baseEntitySchema } from './base.schemas';
import { emailSchema, fullnameSchema, usernameSchema } from './fields.schemas';
import { inviteDefaultTtl, inviteMaxTtl, inviteMinTtl } from '../const';

export const inviteCreateSchema = z.object({
  email: emailSchema.nullish(),
  ttl: z
    .number()
    .int()
    .min(inviteMinTtl)
    .max(inviteMaxTtl)
    .default(inviteDefaultTtl),
});
export type IInviteCreate = z.infer<typeof inviteCreateSchema>;

export const inviteUserSchema = z.object({
  id: z.number().int(),
  username: usernameSchema,
  fullname: fullnameSchema,
});
export type IInviteUser = z.infer<typeof inviteUserSchema>;

export const inviteAuthorSchema = inviteUserSchema;
export type IInviteAuthor = IInviteUser;

export const inviteStatusSchema = z.enum([
  'active',
  'used',
  'revoked',
  'expired',
]);
export type TInviteStatus = z.infer<typeof inviteStatusSchema>;

export const inviteSchema = baseEntitySchema.extend({
  id: z.number().int(),
  code: z.string(),
  email: emailSchema.nullable().optional(),
  author: inviteAuthorSchema,
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().nullish(),
  usedBy: inviteAuthorSchema.nullable().optional(),
  revokedAt: z.coerce.date().nullish(),
  status: inviteStatusSchema,
});
export type IInvite = z.infer<typeof inviteSchema>;
