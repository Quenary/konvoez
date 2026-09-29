import { createZodDto } from 'nestjs-zod';
import {
  authLoginSchema,
  passwordRecoveryConfirmSchema,
  passwordRecoveryRequestSchema,
} from '@konvoez/shared';

export class AuthLoginDto extends createZodDto(authLoginSchema) {}

export class PasswordRecoveryRequestDto extends createZodDto(
  passwordRecoveryRequestSchema,
) {}

export class PasswordRecoveryConfirmDto extends createZodDto(
  passwordRecoveryConfirmSchema,
) {}

export class AuthJWTData {
  type!: 'access' | 'refresh';
  userId!: number;
}
