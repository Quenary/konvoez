import * as z from 'zod';
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
  sendEmail: z.boolean().optional().default(false),
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

export const inviteSchema = baseEntitySchema
  .extend({
    id: z.number().int(),
    code: stringSchema.optional(),
    email: emailSchema.nullish(),
    author: inviteAuthorSchema,
    expiresAt: z.coerce.date(),
    usedAt: z.coerce.date().nullish(),
    usedBy: inviteAuthorSchema.nullish(),
    revokedAt: z.coerce.date().nullish(),
    status: inviteStatusSchema,
    emailSent: z.boolean().default(false),
    emailSentAt: z.coerce.date().nullish(),
    url: z.string().optional(),
    emailSendFailed: z.boolean().optional(),
  })
  .superRefine((invite, ctx) => {
    const alive = invite.status === 'active';
    if (alive && !invite.code) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message: 'Active invite requires a code',
      });
    }
    if (!alive && invite.code) {
      ctx.addIssue({
        code: 'custom',
        path: ['code'],
        message: 'Invite code is only available while the invite is active',
      });
    }
    if (!alive && invite.url) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'Invite url is only available while the invite is active',
      });
    }
  });
export type IInvite = z.infer<typeof inviteSchema>;
