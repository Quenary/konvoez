import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import { beforeEach, describe, expect, it } from 'vitest';
import { insertMentionPlaceholders } from './render-mentions';

describe('insertMentionPlaceholders', () => {
  let sanitizer: NgDompurifySanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NgDompurifySanitizer],
    });
    sanitizer = TestBed.inject(NgDompurifySanitizer);
  });

  it('returns empty string for empty input', () => {
    expect(insertMentionPlaceholders('')).toBe('');
  });

  it('inserts placeholder spans for user, role, and everyone tokens', () => {
    const input = '<p>Hello <@1> and <@&10> and @everyone!</p>';
    const result = insertMentionPlaceholders(input);

    expect(result).toContain(
      '<span data-type="mention" data-kind="user" data-id="1">&lt;@1&gt;</span>',
    );
    expect(result).toContain(
      '<span data-type="mention" data-kind="role" data-id="10">&lt;@&amp;10&gt;</span>',
    );
    expect(result).toContain(
      '<span data-type="mention" data-kind="everyone">@everyone</span>',
    );
  });

  it('leaves tokens inside <code> and <pre> elements untouched', () => {
    const input =
      '<p>Check <code><@1></code> and <pre><@&2> @everyone</pre> but <@3> outside</p>';
    const result = insertMentionPlaceholders(input);

    expect(result).toContain('<code>&lt;@1&gt;</code>');
    expect(result).toContain('<pre>&lt;@&amp;2&gt; @everyone</pre>');
    expect(result).toContain(
      '<span data-type="mention" data-kind="user" data-id="3">',
    );
  });

  it('ensures placeholder output survives NgDompurifySanitizer with data attributes intact', () => {
    const input = '<p>Hi <@42></p>';
    const placeholders = insertMentionPlaceholders(input);
    const sanitized = sanitizer.sanitize(SecurityContext.HTML, placeholders);

    expect(sanitized).toContain('data-type="mention"');
    expect(sanitized).toContain('data-kind="user"');
    expect(sanitized).toContain('data-id="42"');
  });
});
