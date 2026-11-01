import { createZodDto } from 'nestjs-zod';
import {
  profileEmailChangeConfirmSchema,
  profileEmailVerificationConfirmSchema,
  profileUpdateSchema,
} from '@konvoez/shared';

export class UpdateProfileDto extends createZodDto(profileUpdateSchema) {}

export class ProfileEmailVerificationConfirmDto extends createZodDto(
  profileEmailVerificationConfirmSchema,
) {}

export class ProfileEmailChangeConfirmDto extends createZodDto(
  profileEmailChangeConfirmSchema,
) {}
