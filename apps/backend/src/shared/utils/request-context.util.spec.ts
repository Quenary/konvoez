import { EntityManager, RequestContext } from '@mikro-orm/core';
import { ensureRequestContext } from './request-context.util';

describe('ensureRequestContext', () => {
  it('should execute directly when RequestContext already exists', async () => {
    const currentSpy = jest
      .spyOn(RequestContext, 'currentRequestContext')
      .mockReturnValue({} as unknown as RequestContext);
    const createSpy = jest.spyOn(RequestContext, 'create');
    const mockEm = { fork: jest.fn() } as unknown as EntityManager;
    const fn = jest.fn().mockResolvedValue('existing-result');

    const result = await ensureRequestContext(mockEm, fn);

    expect(result).toBe('existing-result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();

    currentSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('should execute directly when em has no fork function', async () => {
    const currentSpy = jest
      .spyOn(RequestContext, 'currentRequestContext')
      .mockReturnValue(undefined);
    const createSpy = jest.spyOn(RequestContext, 'create');
    const mockEm = {} as unknown as EntityManager;
    const fn = jest.fn().mockResolvedValue('no-fork-result');

    const result = await ensureRequestContext(mockEm, fn);

    expect(result).toBe('no-fork-result');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(createSpy).not.toHaveBeenCalled();

    currentSpy.mockRestore();
    createSpy.mockRestore();
  });

  it('should call RequestContext.create when no context exists and fork is available', async () => {
    const currentSpy = jest
      .spyOn(RequestContext, 'currentRequestContext')
      .mockReturnValue(undefined);
    const createSpy = jest
      .spyOn(RequestContext, 'create')
      .mockImplementation(async (_em: unknown, callback: () => unknown) =>
        callback(),
      );
    const mockEm = { fork: jest.fn() } as unknown as EntityManager;
    const fn = jest.fn().mockResolvedValue('created-context-result');

    const result = await ensureRequestContext(mockEm, fn);

    expect(result).toBe('created-context-result');
    expect(createSpy).toHaveBeenCalledWith(mockEm, expect.any(Function));
    expect(fn).toHaveBeenCalledTimes(1);

    currentSpy.mockRestore();
    createSpy.mockRestore();
  });
});
