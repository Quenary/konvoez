import { z } from 'zod';
import {
  fullnameMaxLength,
  fullnameMinLength,
  messageMaxLength,
  messageMinLength,
  passwordMaxLength,
  passwordMinLength,
  passwordRegexp,
  roomNameMaxLength,
  roomNameMinLength,
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

export const emailSchema = z.email({ error: SCHEMA_ERROR.EMAIL });

export const messageContentSchema = lengthString(
  messageMinLength,
  messageMaxLength,
  SCHEMA_ERROR.MESSAGE_LENGTH,
);

export const roomNameSchema = lengthString(
  roomNameMinLength,
  roomNameMaxLength,
  SCHEMA_ERROR.ROOM_NAME_LENGTH,
);
