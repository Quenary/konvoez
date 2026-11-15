import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { CLIENT_LANGUAGE_HEADER } from '@konvoez/shared';
import { ClientLanguageInterceptor } from './client-language.interceptor';
import { UsersService } from '../../features/users/users.service';
import { GetUserFullDto } from '../../features/users/users.dto';

describe('ClientLanguageInterceptor', () => {
  let interceptor: ClientLanguageInterceptor;
  let usersServiceMock: { updateLastDetectedLocale: jest.Mock };
  let nextMock: CallHandler;

  beforeEach(() => {
    usersServiceMock = {
      updateLastDetectedLocale: jest.fn().mockResolvedValue(undefined),
    };
    interceptor = new ClientLanguageInterceptor(
      usersServiceMock as unknown as UsersService,
    );
    nextMock = {
      handle: jest.fn().mockReturnValue(of('response')),
    };
  });

  const createContext = (
    req: {
      headers: Record<string, string | string[] | undefined>;
      author?: Partial<GetUserFullDto>;
    },
    type = 'http',
  ): ExecutionContext =>
    ({
      getType: () => type,
      switchToHttp: () => ({
        getRequest: () => req,
      }),
    }) as unknown as ExecutionContext;

  it('updates lastDetectedLocale when language is null and header differs', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('ru-RU');
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'ru-RU',
    );
    expect(nextMock.handle).toHaveBeenCalled();
  });

  it('falls back to accept-language header when custom header is absent', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('ru-RU');
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'ru-RU',
    );
  });

  it('prefers custom header over accept-language', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'en-GB',
        'accept-language': 'ru-RU,ru;q=0.9',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('en-GB');
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'en-GB',
    );
  });

  it('updates lastDetectedLocale even when author.language is explicitly set', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: 'en',
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('ru-RU');
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'ru-RU',
    );
  });

  it('truncates detected locale to 64 characters', () => {
    const longLocale = 'a'.repeat(100);
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: longLocale,
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('a'.repeat(64));
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'a'.repeat(64),
    );
  });

  it('does not update when lastDetectedLocale already matches detected header', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'ru-RU',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(usersServiceMock.updateLastDetectedLocale).not.toHaveBeenCalled();
  });

  it('sanitizes composite custom client language header', () => {
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU,ru;q=0.9',
      },
      author,
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(author.lastDetectedLocale).toBe('ru-RU');
    expect(usersServiceMock.updateLastDetectedLocale).toHaveBeenCalledWith(
      10,
      'ru-RU',
    );
  });

  it('does nothing when req.author is undefined for unauthenticated requests', () => {
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU',
      },
    };

    interceptor.intercept(createContext(req), nextMock);

    expect(usersServiceMock.updateLastDetectedLocale).not.toHaveBeenCalled();
    expect(nextMock.handle).toHaveBeenCalled();
  });

  it('logs a warning and swallows rejection when updateLastDetectedLocale fails', async () => {
    usersServiceMock.updateLastDetectedLocale.mockRejectedValueOnce(
      new Error('DB failure'),
    );
    const author: Partial<GetUserFullDto> = {
      id: 10,
      language: null,
      lastDetectedLocale: 'en',
    };
    const req = {
      headers: {
        [CLIENT_LANGUAGE_HEADER]: 'ru-RU',
      },
      author,
    };

    expect(() =>
      interceptor.intercept(createContext(req), nextMock),
    ).not.toThrow();
    expect(nextMock.handle).toHaveBeenCalled();
  });

  it('ignores non-http execution contexts', () => {
    const context = createContext({ headers: {} }, 'ws');
    interceptor.intercept(context, nextMock);

    expect(usersServiceMock.updateLastDetectedLocale).not.toHaveBeenCalled();
    expect(nextMock.handle).toHaveBeenCalled();
  });
});
