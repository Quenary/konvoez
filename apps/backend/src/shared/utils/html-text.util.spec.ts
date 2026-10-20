import { parseMentions } from '@konvoez/shared';
import {
  decodeBasicEntities,
  htmlToMentionText,
  htmlToPlainText,
} from './html-text.util';

describe('htmlToPlainText', () => {
  it('should strip HTML tags and collapse whitespace', () => {
    expect(htmlToPlainText('<p>Hello <b>World</b>!</p>')).toBe('Hello World!');
    expect(htmlToPlainText('<p>Line 1</p>\n<p>Line   2</p>')).toBe(
      'Line 1 Line 2',
    );
  });

  it('should drop tags so event-handler markup is not kept', () => {
    expect(
      htmlToPlainText('<p onclick="evil()">Hi</p><img src=x onerror=alert(1)>'),
    ).toBe('Hi');
  });

  it('should truncate by unicode code points and add an ellipsis', () => {
    expect(htmlToPlainText('abcdef', 5)).toBe('ab...');
    expect(htmlToPlainText('🎉🎊🚀✨🌟', 4)).toBe('🎉...');
  });

  it('should return empty string for markup-only content', () => {
    expect(htmlToPlainText('<p></p>')).toBe('');
  });
});

describe('decodeBasicEntities and htmlToMentionText', () => {
  it('decodes basic HTML entities in a single pass', () => {
    expect(decodeBasicEntities('&lt;@12&gt;')).toBe('<@12>');
    expect(decodeBasicEntities('&lt;@&amp;3&gt;')).toBe('<@&3>');
    expect(decodeBasicEntities('&quot;hello&#39;')).toBe('"hello\'');
  });

  it('does not recursively decode entities like &amp;lt;', () => {
    // &amp;lt; should decode to &lt;, not to <
    expect(decodeBasicEntities('&amp;lt;@12&gt;')).toBe('&lt;@12>');
  });

  it('converts HTML with escaped tokens to decoded mention text', () => {
    expect(
      htmlToMentionText(
        '<p>Hello &lt;@12&gt; and &lt;@&amp;3&gt; @everyone</p>',
      ),
    ).toBe('Hello <@12> and <@&3> @everyone');
  });

  it('strips pre and code blocks before extracting mention text', () => {
    expect(
      htmlToMentionText(
        '<p>Hi &lt;@12&gt;, check <code>&lt;@34&gt;</code> and <pre><code>@everyone</code></pre></p>',
      ),
    ).toBe('Hi <@12>, check and');
  });

  it('separates block boundaries so mentions at block starts are recognized', () => {
    expect(
      parseMentions(htmlToMentionText('<p>hello</p><p>@everyone</p>')).everyone,
    ).toBe(true);

    expect(parseMentions(htmlToMentionText('a<br>@everyone')).everyone).toBe(
      true,
    );
    expect(parseMentions(htmlToMentionText('a<br/>@everyone')).everyone).toBe(
      true,
    );

    expect(
      parseMentions(htmlToMentionText('<p>a</p><p>&lt;@1&gt;</p>')).userIds,
    ).toEqual([1]);

    expect(
      parseMentions(htmlToMentionText('<ul><li>x</li><li>@everyone</li></ul>'))
        .everyone,
    ).toBe(true);

    expect(
      parseMentions(htmlToMentionText('<p>email@everyone.com</p>')).everyone,
    ).toBe(false);

    expect(
      parseMentions(htmlToMentionText('<pre>@everyone</pre>')).everyone,
    ).toBe(false);
  });
});
