import { createZodDto } from 'nestjs-zod';
import {
  authLoginSchema,
  authRegisterSchema,
  passwordRecoveryConfirmSchema,
  passwordRecoveryRequestSchema,
} from '@konvoez/shared';

export class AuthLoginDto extends createZodDto(authLoginSchema) {}

export class AuthRegisterDto extends createZodDto(authRegisterSchema) {}

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
