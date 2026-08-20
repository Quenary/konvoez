import { createZodDto } from 'nestjs-zod';
import {
  userCreateSchema,
  userSchema,
  userUpdateSchema,
} from '@konvoez/shared';

export class CreateUserDto extends createZodDto(userCreateSchema) {}

export class UpdateUserDto extends createZodDto(userUpdateSchema) {}

export class GetUserDto extends createZodDto(userSchema) {}
