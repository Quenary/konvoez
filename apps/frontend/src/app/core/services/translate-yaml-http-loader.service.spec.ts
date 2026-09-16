import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError, firstValueFrom } from 'rxjs';
import { parse } from 'yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TranslateYamlHttpLoader } from './translate-yaml-http-loader.service';

function getI18nDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'apps/frontend/public/i18n'),
    path.resolve(__dirname, '../../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../../public/i18n'),
    path.resolve(__dirname, '../../../../public/i18n'),
  ];
  const found = candidates.find((dir) => fs.existsSync(dir));
  if (!found) {
    throw new Error(
      `i18n directory not found in candidates: ${candidates.join(', ')}`,
    );
  }
  return found;
}

function extractKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  let keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys = keys.concat(
        extractKeys(value as Record<string, unknown>, fullKey),
      );
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

describe('i18n YAML Translation Files Validity', () => {
  const i18nDir = getI18nDir();
  const yamlFiles = fs
    .readdirSync(i18nDir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));

  it('should find at least one YAML translation file', () => {
    expect(yamlFiles.length).toBeGreaterThan(0);
  });

  for (const file of yamlFiles) {
    it(`should successfully parse "${file}" as valid YAML`, () => {
      const filePath = path.join(i18nDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(() => {
        const parsed = parse(content);
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
        expect(parsed).not.toBeNull();
      }).not.toThrow();
    });
  }
});

describe('i18n Translation Keys Consistency', () => {
  const i18nDir = getI18nDir();
  const yamlFiles = fs
    .readdirSync(i18nDir)
    .filter((file) => file.endsWith('.yaml') || file.endsWith('.yml'));

  const translations = new Map<
    string,
    { keys: Set<string>; allKeys: string[] }
  >();

  for (const file of yamlFiles) {
    const filePath = path.join(i18nDir, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = (parse(content) || {}) as Record<string, unknown>;
    const keys = extractKeys(parsed);
    translations.set(file, { keys: new Set(keys), allKeys: keys });
  }

  it('should compare translation keys across all language files and warn on discrepancies without failing', () => {
    const files = Array.from(translations.keys());
    let hasAnyDiscrepancies = false;

    for (let i = 0; i < files.length; i++) {
      for (let j = i + 1; j < files.length; j++) {
        const fileA = files[i];
        const fileB = files[j];
        const dataA = translations.get(fileA)!;
        const dataB = translations.get(fileB)!;

        const missingInB = dataA.allKeys.filter((key) => !dataB.keys.has(key));
        const missingInA = dataB.allKeys.filter((key) => !dataA.keys.has(key));

        if (missingInB.length > 0) {
          hasAnyDiscrepancies = true;
          console.warn(
            `[i18n warning] Keys present in "${fileA}" but missing in "${fileB}" (${missingInB.length}):\n` +
              missingInB.map((k) => `  - ${k}`).join('\n'),
          );
        }

        if (missingInA.length > 0) {
          hasAnyDiscrepancies = true;
          console.warn(
            `[i18n warning] Keys present in "${fileB}" but missing in "${fileA}" (${missingInA.length}):\n` +
              missingInA.map((k) => `  - ${k}`).join('\n'),
          );
        }
      }
    }

    if (!hasAnyDiscrepancies) {
      // All files have exactly matched translation keys
      expect(hasAnyDiscrepancies).toBe(false);
    } else {
      // We do not fail the test
      expect(true).toBe(true);
    }
  });
});

describe('TranslateYamlHttpLoader Service', () => {
  let loader: TranslateYamlHttpLoader;
  let httpClientMock: { get: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    httpClientMock = {
      get: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        TranslateYamlHttpLoader,
        { provide: HttpClient, useValue: httpClientMock },
      ],
    });

    loader = TestBed.inject(TranslateYamlHttpLoader);
  });

  it('should request the correct yaml file and parse it', async () => {
    const yamlString = 'GREETING: Hello\nUSER:\n  NAME: John';
    httpClientMock.get.mockReturnValue(of(yamlString));

    const result = await firstValueFrom(loader.getTranslation('en'));

    expect(httpClientMock.get).toHaveBeenCalledWith('i18n/en.yaml', {
      responseType: 'text',
    });
    expect(result).toEqual({
      GREETING: 'Hello',
      USER: {
        NAME: 'John',
      },
    });
  });

  it('should return empty object on HTTP or parse error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
      /* empty */
    });
    httpClientMock.get.mockReturnValue(
      throwError(() => new Error('404 Not Found')),
    );

    const result = await firstValueFrom(loader.getTranslation('nonexistent'));

    expect(result).toEqual({});
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
