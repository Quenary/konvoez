import { describe, it, expect, beforeEach } from 'vitest';
import {
  Injector,
  runInInjectionContext,
  Sanitizer,
  SecurityContext,
  signal,
} from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { RolesStore } from '@core/stores/roles.store';
import { UsersStore } from '@core/stores/users.store';
import { IRoleSummary, IUser } from '@konvoez/shared';
import { TextContentPipe } from './text-content.pipe';

describe('TextContentPipe', () => {
  let pipe: TextContentPipe;
  let sanitizer: Sanitizer;

  const alice: IUser = {
    id: 1,
    username: 'alice',
    fullname: 'Alice Wonderland',
    email: 'alice@example.com',
    avatar: null,
    avatarUrl: null,
    isOwner: false,
    roles: [],
    permissions: [],
    createdAt: new Date(),
    updatedAt: null,
  };

  const adminRole: IRoleSummary = {
    id: 10,
    name: 'Admin',
    color: '#ff0000',
    priority: 1,
    mentionable: true,
  };

  const usersMap = signal<Record<number, IUser>>({ 1: alice });
  const rolesMap = signal<Record<number, IRoleSummary>>({ 10: adminRole });

  beforeEach(() => {
    sanitizer = {
      sanitize: (_context: SecurityContext, value: string | null) => value,
    } as Sanitizer;

    const injector = Injector.create({
      providers: [
        provideTranslateService(),
        {
          provide: Sanitizer,
          useValue: sanitizer,
        },
        {
          provide: UsersStore,
          useValue: { entityMap: usersMap },
        },
        {
          provide: RolesStore,
          useValue: { rolesById: rolesMap },
        },
      ],
    });

    runInInjectionContext(injector, () => {
      pipe = new TextContentPipe();
    });
  });

  it('should return empty string for null or empty content', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });

  it('should strip HTML tags and extract textContent', () => {
    const html = '<p>Hello <b>World</b>!</p>';
    expect(pipe.transform(html)).toBe('Hello World!');
  });

  it('should collapse multiple newlines and spaces into single space', () => {
    const html = '<p>Line 1</p>\n<p>Line   2</p>';
    expect(pipe.transform(html)).toBe('Line 1 Line 2');
  });

  it('should sanitize input before extracting textContent', () => {
    let sanitizedContext: SecurityContext | null = null;
    sanitizer.sanitize = (ctx: SecurityContext, val: unknown) => {
      sanitizedContext = ctx;
      return typeof val === 'string'
        ? val.replace('<script>', '').replace('</script>', '')
        : null;
    };

    const result = pipe.transform('<p>Test<script>alert(1)</script></p>');
    expect(sanitizedContext).toBe(SecurityContext.HTML);
    expect(result).toBe('Testalert(1)');
  });

  it('leaves tokens as-is when renderMentions is false or omitted', () => {
    const html = '<p>Hi &lt;@1&gt; and &lt;@&amp;10&gt; and @everyone</p>';
    expect(pipe.transform(html)).toBe('Hi <@1> and <@&10> and @everyone');
    expect(pipe.transform(html, false)).toBe(
      'Hi <@1> and <@&10> and @everyone',
    );
  });

  it('renders mention labels when renderMentions is true', () => {
    const html = '<p>Hi &lt;@1&gt; and &lt;@&amp;10&gt; and @everyone</p>';
    expect(pipe.transform(html, true)).toBe(
      'Hi @alice and @Admin and @everyone',
    );
  });

  it('renders @unknown when mention id is not found', () => {
    const html = '<p>Unknown &lt;@999&gt; and &lt;@&amp;888&gt;</p>';
    expect(pipe.transform(html, true)).toBe('Unknown @unknown and @unknown');
  });
});
