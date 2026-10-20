import * as z from 'zod';
import { baseEntitySchema, SCHEMA_ERROR } from './base.schemas';
import { EPermission } from '../enums';

export const permissionSchema = z.nativeEnum(EPermission);

export const roleNameSchema = z
  .string()
  .trim()
  .min(1, { error: SCHEMA_ERROR.ROLE_NAME_REQUIRED })
  .max(64, { error: SCHEMA_ERROR.ROLE_NAME_LENGTH });

export const roleColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { error: SCHEMA_ERROR.COLOR_HEX })
  .nullish();

export const roleSummarySchema = z.object({
  id: z.number().int(),
  name: roleNameSchema,
  color: roleColorSchema,
  priority: z.number().int().default(0),
  mentionable: z.boolean().default(false),
});

export type IRoleSummary = z.infer<typeof roleSummarySchema>;

export const roleSchema = baseEntitySchema.extend({
  id: z.number().int(),
  name: roleNameSchema,
  color: roleColorSchema,
  priority: z.number().int().default(0),
  isDefault: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  permissions: z.array(permissionSchema).default([]),
  userCount: z.number().int().optional(),
});

export type IRole = z.infer<typeof roleSchema>;

export const createRoleSchema = z.object({
  name: roleNameSchema,
  color: roleColorSchema.optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  isDefault: z.boolean().default(false),
  mentionable: z.boolean().default(false),
  permissions: z.array(permissionSchema).default([]),
});

export type ICreateRole = z.infer<typeof createRoleSchema>;

export const updateRoleSchema = z.object({
  name: roleNameSchema.optional(),
  color: roleColorSchema.optional(),
  priority: z.number().int().min(0).max(1000).optional(),
  isDefault: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  permissions: z.array(permissionSchema).optional(),
});

export type IUpdateRole = z.infer<typeof updateRoleSchema>;
