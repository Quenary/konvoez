import { describe, expect, it } from 'vitest';
import { authLoginFormSchema } from './forms.schema';

describe('authLoginFormSchema', () => {
  it.each([
    ['valid username', 'valid_user', true],
    ['valid email', 'user@example.com', true],
    ['invalid login', 'x', false],
  ])('validates %s', (_case, login, success) => {
    const result = authLoginFormSchema.shape.login.safeParse(login);

    expect(result.success).toBe(success);
    if (!success && !result.success) {
      expect(result.error.issues[0]?.message).toBe('VALIDATION.LOGIN');
    }
  });
});
