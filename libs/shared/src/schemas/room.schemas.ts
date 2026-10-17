import * as z from 'zod';
import {
  baseEntitySchema,
  entityDeletedSchema,
  SCHEMA_ERROR,
  stringSchema,
} from './base.schemas';
import { roomNameSchema } from './fields.schemas';
import { ERoomType } from '../enums';
import { userBriefSchema } from './user.schemas';

export const roomTypeSchema = z.enum(ERoomType, {
  error: SCHEMA_ERROR.ROOM_TYPE,
});

export const roomCreateSchema = z.object({
  name: roomNameSchema,
  type: roomTypeSchema,
  avatar: stringSchema.optional(),
  isPrivate: z.boolean().default(false),
  allowedRoleIds: z.array(z.number().int()).optional(),
  allowedUserIds: z.array(z.number().int()).optional(),
});

export const roomUpdateSchema = z.object({
  name: roomNameSchema.optional(),
  avatar: stringSchema.nullish(),
  isPrivate: z.boolean().optional(),
  allowedRoleIds: z.array(z.number().int()).optional(),
  allowedUserIds: z.array(z.number().int()).optional(),
});

export const roomAuthorSchema = userBriefSchema.clone();
export type IRoomAuthor = z.infer<typeof roomAuthorSchema>;

export const roomSchema = baseEntitySchema.extend({
  id: z.number().int(),
  name: roomNameSchema,
  type: roomTypeSchema,
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
  author: roomAuthorSchema,
  isPrivate: z.boolean().default(false),
  allowedRoleIds: z.array(z.number().int()).default([]),
  allowedUserIds: z.array(z.number().int()).default([]),
});

export type IRoomCreate = z.infer<typeof roomCreateSchema>;
export type IRoomUpdate = z.infer<typeof roomUpdateSchema>;
export type IRoom = z.infer<typeof roomSchema>;

export const roomDeletedSchema = entityDeletedSchema.clone();
export type IRoomDeleted = z.infer<typeof roomDeletedSchema>;
