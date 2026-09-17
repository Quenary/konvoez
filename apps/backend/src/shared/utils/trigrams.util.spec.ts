import { extractTrigrams } from './trigrams.util';

describe('extractTrigrams', () => {
  it('should extract unique trigrams from simple text', () => {
    const text = 'hello';
    // 'hello' -> 'hel', 'ell', 'llo'
    const result = extractTrigrams(text);
    expect(result).toHaveLength(3);
    expect(result).toContain('hel');
    expect(result).toContain('ell');
    expect(result).toContain('llo');
  });

  it('should remove HTML tags', () => {
    const text = '<p>hello</p>';
    const result = extractTrigrams(text);
    expect(result).toHaveLength(3);
    expect(result).toContain('hel');
    expect(result).toContain('ell');
    expect(result).toContain('llo');
    expect(result).not.toContain('<p>');
    expect(result).not.toContain('</p>');
  });

  it('should remove whitespace and convert to lowercase', () => {
    const text = 'He ll o';
    const result = extractTrigrams(text);
    expect(result).toHaveLength(3);
    expect(result).toContain('hel');
    expect(result).toContain('ell');
    expect(result).toContain('llo');
  });

  it('should return unique trigrams', () => {
    const text = 'hello hello';
    // 'hellohello'
    const result = extractTrigrams(text);
    // h e l l o h e l l o
    // hel ell llo loh ohe hel ell llo
    // unique: hel, ell, llo, loh, ohe
    expect(result).toHaveLength(5);
    expect(result).toContain('hel');
    expect(result).toContain('ell');
    expect(result).toContain('llo');
    expect(result).toContain('loh');
    expect(result).toContain('ohe');
  });

  it('should retain punctuation', () => {
    const text = 'hi@bot.com';
    // 'hi@bot.com'
    const result = extractTrigrams(text);
    expect(result).toContain('hi@');
    expect(result).toContain('i@b');
    expect(result).toContain('@bo');
    expect(result).toContain('bot');
    expect(result).toContain('ot.');
    expect(result).toContain('t.c');
    expect(result).toContain('.co');
    expect(result).toContain('com');
  });

  it('should handle unicode characters and emojis without corrupting surrogate pairs', () => {
    const text = '🎉🎊🚀';
    const result = extractTrigrams(text);
    expect(result).toEqual(['🎉🎊🚀']);
  });

  it('should return empty array for text shorter than 3 characters', () => {
    const text = 'hi';
    const result = extractTrigrams(text);
    expect(result).toEqual([]);
  });
});
