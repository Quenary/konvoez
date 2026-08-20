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

const lengthString = (min: number, max: number, error: string) =>
  z
    .string({ error })
    .min(min, { error })
    .max(max, { error });

export const usernameSchema = lengthString(
  usernameMinLength,
  usernameMaxLength,
  'VALIDATION.USERNAME_LENGTH',
);

export const passwordSchema = lengthString(
  passwordMinLength,
  passwordMaxLength,
  'VALIDATION.PASSWORD_LENGTH',
).regex(passwordRegexp, { error: 'VALIDATION.PASSWORD_PATTERN' });

export const fullnameSchema = lengthString(
  fullnameMinLength,
  fullnameMaxLength,
  'VALIDATION.FULLNAME_LENGTH',
);

export const emailSchema = z.email({ error: 'VALIDATION.EMAIL' });

export const messageContentSchema = lengthString(
  messageMinLength,
  messageMaxLength,
  'VALIDATION.MESSAGE_LENGTH',
);

export const roomNameSchema = lengthString(
  roomNameMinLength,
  roomNameMaxLength,
  'VALIDATION.ROOM_NAME_LENGTH',
);
