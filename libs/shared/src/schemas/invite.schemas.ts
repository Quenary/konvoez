import { z } from 'zod';
import { baseEntitySchema, stringSchema } from './base.schemas';
import { emailSchema } from './fields.schemas';
import { inviteDefaultTtl, inviteMaxTtl, inviteMinTtl } from '../const';
import { userBriefSchema } from './user.schemas';

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

export const inviteAuthorSchema = userBriefSchema.clone();
export type IInviteAuthor = z.infer<typeof inviteAuthorSchema>;

export const inviteStatusSchema = z.enum([
  'active',
  'used',
  'revoked',
  'expired',
]);
export type TInviteStatus = z.infer<typeof inviteStatusSchema>;

export const inviteSchema = baseEntitySchema.extend({
  id: z.number().int(),
  code: stringSchema,
  email: emailSchema.nullish(),
  author: inviteAuthorSchema,
  expiresAt: z.coerce.date(),
  usedAt: z.coerce.date().nullish(),
  usedBy: inviteAuthorSchema.nullish(),
  revokedAt: z.coerce.date().nullish(),
  status: inviteStatusSchema,
});
export type IInvite = z.infer<typeof inviteSchema>;
