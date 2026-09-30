import { createZodDto } from 'nestjs-zod';
import { userManagementUpdateSchema } from '@konvoez/shared';

export class UserManagementUpdateDto extends createZodDto(
  userManagementUpdateSchema,
) {}
