import { createZodDto } from 'nestjs-zod';
import { userFullSchema, userSafeSchema } from '@konvoez/shared';

/** Public user for general API and realtime. */
export class GetUserSafeDto extends createZodDto(userSafeSchema) {}

/** Self/auth and admin user-management. */
export class GetUserFullDto extends createZodDto(userFullSchema) {}
