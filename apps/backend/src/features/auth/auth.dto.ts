import { createZodDto } from 'nestjs-zod';
import { authLoginSchema } from '@konvoez/shared';

export class AuthLoginDto extends createZodDto(authLoginSchema) {}

export class AuthJWTData {
  type!: 'access' | 'refresh';
  userId!: number;
}
