import { createZodDto } from 'nestjs-zod';
import { userSchema } from '@konvoez/shared';

export class GetUserDto extends createZodDto(userSchema) {}
