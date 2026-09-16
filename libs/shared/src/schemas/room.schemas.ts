import { z } from 'zod';
import { baseEntitySchema } from './base.schemas';
import { roomNameSchema } from './fields.schemas';

export enum ERoomType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export const roomCreateSchema = z.object({
  name: roomNameSchema,
  type: z.enum(ERoomType, { error: 'VALIDATION.ROOM_TYPE' }),
  avatar: z.string().optional(),
});

export const roomUpdateSchema = z.object({
  name: roomNameSchema,
  avatar: z.string().nullish(),
});

export const roomSchema = baseEntitySchema.extend({
  id: z.number().int(),
  name: roomNameSchema,
  type: z.enum(ERoomType),
  avatar: z.string().nullish(),
  avatarUrl: z.string().nullish(),
});

export type IRoomCreate = z.infer<typeof roomCreateSchema>;
export type IRoomUpdate = z.infer<typeof roomUpdateSchema>;
export type IRoom = z.infer<typeof roomSchema>;
