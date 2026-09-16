import { z } from 'zod';

export const DEFAULT_SCHEMA_ERROR = 'VALIDATION.INVALID_SCHEMA';

export const baseEntitySchema = z.object({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().nullish(),
});

export type TBaseEntity = z.infer<typeof baseEntitySchema>;
