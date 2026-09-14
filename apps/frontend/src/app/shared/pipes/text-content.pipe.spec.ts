import { describe, it, expect, beforeEach } from 'vitest';
import {
  Injector,
  runInInjectionContext,
  Sanitizer,
  SecurityContext,
} from '@angular/core';
import { TextContentPipe } from './text-content.pipe';

describe('TextContentPipe', () => {
  let pipe: TextContentPipe;
  let sanitizer: Sanitizer;

  beforeEach(() => {
    sanitizer = {
      sanitize: (_context: SecurityContext, value: string | null) => value,
    } as Sanitizer;

    const injector = Injector.create({
      providers: [
        {
          provide: Sanitizer,
          useValue: sanitizer,
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
});
