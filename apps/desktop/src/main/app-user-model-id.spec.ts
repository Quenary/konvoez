import { describe, expect, it } from 'vitest';
import { APP_USER_MODEL_ID, resolveAppUserModelId } from './app-user-model-id';

describe('resolveAppUserModelId', () => {
  it.each([
    { isPackaged: true, expected: APP_USER_MODEL_ID },
    { isPackaged: false, expected: `${APP_USER_MODEL_ID}.dev` },
  ])(
    'returns $expected when isPackaged is $isPackaged',
    ({ isPackaged, expected }) => {
      expect(resolveAppUserModelId(isPackaged)).toBe(expected);
    },
  );
});
