import { createZodDto } from 'nestjs-zod';
import {
  authLoginTwoFactorSchema,
  twoFactorConfirmSchema,
  twoFactorEnableSchema,
  twoFactorRecoveryCodesResponseSchema,
  twoFactorSetupResponseSchema,
  twoFactorSetupSchema,
} from '@konvoez/shared';

export class AuthLoginTwoFactorDto extends createZodDto(
  authLoginTwoFactorSchema,
) {}

export class TwoFactorSetupDto extends createZodDto(twoFactorSetupSchema) {}

export class TwoFactorSetupResponseDto extends createZodDto(
  twoFactorSetupResponseSchema,
) {}

export class TwoFactorEnableDto extends createZodDto(twoFactorEnableSchema) {}

export class TwoFactorConfirmDto extends createZodDto(twoFactorConfirmSchema) {}

export class TwoFactorRecoveryCodesResponseDto extends createZodDto(
  twoFactorRecoveryCodesResponseSchema,
) {}
