import { isEnospc } from './is-enospc';

describe('isEnospc', () => {
  it('matches a node error with code ENOSPC', () => {
    expect(isEnospc(Object.assign(new Error('full'), { code: 'ENOSPC' }))).toBe(
      true,
    );
  });

  it('rejects other errors', () => {
    expect(
      isEnospc(Object.assign(new Error('missing'), { code: 'ENOENT' })),
    ).toBe(false);
    expect(isEnospc(null)).toBe(false);
    expect(isEnospc('ENOSPC')).toBe(false);
  });
});
