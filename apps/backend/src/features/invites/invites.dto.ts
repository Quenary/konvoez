import { createZodDto } from 'nestjs-zod';
import { inviteCreateSchema, inviteSchema } from '@konvoez/shared';

export class InviteCreateDto extends createZodDto(inviteCreateSchema) {}
export class InviteDto extends createZodDto(inviteSchema) {}
