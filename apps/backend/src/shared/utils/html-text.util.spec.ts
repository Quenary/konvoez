import { htmlToPlainText } from './html-text.util';

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
