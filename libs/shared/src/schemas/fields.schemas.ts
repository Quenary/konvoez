import * as z from 'zod';
import {
  fullnameMaxLength,
  fullnameMinLength,
  messageMaxLength,
  messageMinLength,
  passwordMaxLength,
  passwordMinLength,
  passwordRegexp,
  roomAvatarKeyRegexp,
  roomNameMaxLength,
  roomNameMinLength,
  userAvatarKeyRegexp,
  usernameMaxLength,
  usernameMinLength,
} from '../const';
import { SCHEMA_ERROR, stringSchema } from './base.schemas';

const lengthString = (min: number, max: number, error: string) =>
  stringSchema.min(min, { error }).max(max, { error });

export const usernameSchema = lengthString(
  usernameMinLength,
  usernameMaxLength,
  SCHEMA_ERROR.USERNAME_LENGTH,
);

export const passwordSchema = lengthString(
  passwordMinLength,
  passwordMaxLength,
  SCHEMA_ERROR.PASSWORD_LENGTH,
).regex(passwordRegexp, { error: SCHEMA_ERROR.PASSWORD_PATTERN });

export const fullnameSchema = lengthString(
  fullnameMinLength,
  fullnameMaxLength,
  SCHEMA_ERROR.FULLNAME_LENGTH,
);

export const emailSchema = stringSchema
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: SCHEMA_ERROR.EMAIL }));

export const messageContentSchema = lengthString(
  messageMinLength,
  messageMaxLength,
  SCHEMA_ERROR.MESSAGE_LENGTH,
);

export const messageOptionalContentSchema = stringSchema.max(messageMaxLength, {
  error: SCHEMA_ERROR.MESSAGE_LENGTH,
});

export const roomNameSchema = lengthString(
  roomNameMinLength,
  roomNameMaxLength,
  SCHEMA_ERROR.ROOM_NAME_LENGTH,
);

export const userAvatarKeySchema = stringSchema
  .max(255)
  .regex(userAvatarKeyRegexp, { error: SCHEMA_ERROR.INVALID_SCHEMA });

export const roomAvatarKeySchema = stringSchema
  .max(255)
  .regex(roomAvatarKeyRegexp, { error: SCHEMA_ERROR.INVALID_SCHEMA });
