import { SecurityContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NgDompurifySanitizer } from '@taiga-ui/dompurify';
import {
  buildMentionHtml,
  deserializeMentionTokens,
  serializeMentionNodes,
} from './mention-serialization';

describe('mention-serialization', () => {
  let sanitizer: NgDompurifySanitizer;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [NgDompurifySanitizer],
    });
    sanitizer = TestBed.inject(NgDompurifySanitizer);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('serializes mention spans to tokens', () => {
    const html =
      '<p>Hello <span data-type="mention" data-kind="user" data-id="12">@alice</span>, ' +
      '<span data-type="mention" data-kind="role" data-id="3">@Admin</span> and ' +
      '<span data-type="mention" data-kind="everyone">@everyone</span>!</p>';

    const serialized = serializeMentionNodes(html);
    expect(serialized).toBe(
      '<p>Hello &lt;@12&gt;, &lt;@&amp;3&gt; and @everyone!</p>',
    );
  });

  it('deserializes mention tokens to spans with resolved labels', () => {
    const html = '<p>Hello &lt;@12&gt;, &lt;@&amp;3&gt; and @everyone!</p>';

    const deserialized = deserializeMentionTokens(html, (seg) => {
      if (seg.type === 'user') return 'alice';
      if (seg.type === 'role') return 'Admin';
      return 'everyone';
    });

    expect(deserialized).toBe(
      '<p>Hello <span data-type="mention" data-kind="user" data-id="12">@alice</span>, ' +
        '<span data-type="mention" data-kind="role" data-id="3">@Admin</span> and ' +
        '<span data-type="mention" data-kind="everyone">@everyone</span>!</p>',
    );
  });

  it('round-trips user, role, and everyone mentions', () => {
    const original =
      '<p>Check <span data-type="mention" data-kind="user" data-id="42">@bob</span> and ' +
      '<span data-type="mention" data-kind="role" data-id="7">@Mod</span> and ' +
      '<span data-type="mention" data-kind="everyone">@everyone</span></p>';

    const serialized = serializeMentionNodes(original);
    const roundTripped = deserializeMentionTokens(serialized, (seg) => {
      if (seg.type === 'user') return 'bob';
      if (seg.type === 'role') return 'Mod';
      return 'everyone';
    });

    expect(roundTripped).toBe(original);
  });

  it('escapes scripts in buildMentionHtml so label stays text', () => {
    const maliciousLabel = '<script>alert("xss")</script>';
    const html = buildMentionHtml('user', 99, maliciousLabel);

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert("xss")&lt;/script&gt;');

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    expect(doc.querySelector('script')).toBeNull();
    expect(doc.querySelector('span')?.textContent).toBe(`@${maliciousLabel}`);
  });

  it('leaves tokens inside <code> and <pre> untouched', () => {
    const html =
      '<p>Look at <code>&lt;@12&gt;</code> and <pre>&lt;@&amp;3&gt;</pre> but here is &lt;@99&gt;.</p>';

    const result = deserializeMentionTokens(html, () => 'resolved');

    expect(result).toContain('<code>&lt;@12&gt;</code>');
    expect(result).toContain('<pre>&lt;@&amp;3&gt;</pre>');
    expect(result).toContain(
      'here is <span data-type="mention" data-kind="user" data-id="99">@resolved</span>.',
    );
  });

  it('NgDompurifySanitizer keeps data-type, data-kind, and data-id on mention spans', () => {
    const html =
      '<p><span data-type="mention" data-kind="user" data-id="12">@alice</span></p>';

    const sanitized = sanitizer.sanitize(SecurityContext.HTML, html);

    expect(sanitized).toContain('data-type="mention"');
    expect(sanitized).toContain('data-kind="user"');
    expect(sanitized).toContain('data-id="12"');
  });
});
