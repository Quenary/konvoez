import { defineEntity, p } from '@mikro-orm/core';

export const KonvoezBaseEntitySchema = defineEntity({
  abstract: true,
  name: 'KonvoezBaseEntity',
  properties: {
    createdAt: p.datetime().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .nullable()
      .default(null)
      .onUpdate(() => new Date()),
  },
});
