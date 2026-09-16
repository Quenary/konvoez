import { z } from 'zod';
import { baseEntitySchema, SCHEMA_ERROR, stringSchema } from './base.schemas';
import { roomNameSchema } from './fields.schemas';

export enum ERoomType {
  TEXT = 'TEXT',
  VOICE = 'VOICE',
}

export const roomTypeSchema = z.enum(ERoomType, {
  error: SCHEMA_ERROR.ROOM_TYPE,
});

export const roomCreateSchema = z.object({
  name: roomNameSchema,
  type: roomTypeSchema,
  avatar: stringSchema.optional(),
});

export const roomUpdateSchema = z.object({
  name: roomNameSchema,
  avatar: stringSchema.nullish(),
});

export const roomSchema = baseEntitySchema.extend({
  id: z.number().int(),
  name: roomNameSchema,
  type: roomTypeSchema,
  avatar: stringSchema.nullish(),
  avatarUrl: stringSchema.nullish(),
});

export type IRoomCreate = z.infer<typeof roomCreateSchema>;
export type IRoomUpdate = z.infer<typeof roomUpdateSchema>;
export type IRoom = z.infer<typeof roomSchema>;
