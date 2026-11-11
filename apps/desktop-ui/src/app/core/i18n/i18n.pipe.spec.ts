import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DesktopI18nService } from './desktop-i18n.service';
import { I18nPipe } from './i18n.pipe';

describe('I18nPipe & DesktopI18nService', () => {
  it('translates english keys', () => {
    TestBed.configureTestingModule({
      providers: [DesktopI18nService, I18nPipe],
    });

    const pipe = TestBed.inject(I18nPipe);
    expect(pipe.transform('server.title')).toBe('Connect to Konvoez');
    expect(pipe.transform('updater.version', { version: '1.2.3' })).toBe(
      'Version 1.2.3',
    );
  });

  it('updates translation when language is switched', () => {
    TestBed.configureTestingModule({
      providers: [DesktopI18nService, I18nPipe],
    });

    const service = TestBed.inject(DesktopI18nService);
    const pipe = TestBed.inject(I18nPipe);

    expect(pipe.transform('server.title')).toBe('Connect to Konvoez');
    service.setLanguage('ru');
    expect(pipe.transform('server.title')).toBe('Подключение к Konvoez');
  });
});
