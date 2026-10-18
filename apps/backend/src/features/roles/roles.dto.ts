import { createZodDto } from 'nestjs-zod';
import {
  createRoleSchema,
  roleSchema,
  updateRoleSchema,
} from '@konvoez/shared';

export class RoleDto extends createZodDto(roleSchema) {}
export class CreateRoleDto extends createZodDto(createRoleSchema) {}
export class UpdateRoleDto extends createZodDto(updateRoleSchema) {}
