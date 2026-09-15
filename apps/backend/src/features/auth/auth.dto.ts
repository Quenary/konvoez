import { createZodDto } from 'nestjs-zod';
import { authLoginSchema, authSetupStatusSchema } from '@konvoez/shared';

export class AuthLoginDto extends createZodDto(authLoginSchema) {}

export class AuthSetupStatusDto extends createZodDto(authSetupStatusSchema) {}

export class AuthJWTData {
  type!: 'access' | 'refresh';
  userId!: number;
}
