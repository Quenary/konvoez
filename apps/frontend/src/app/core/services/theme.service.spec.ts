import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TUI_DARK_MODE } from '@taiga-ui/core';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let mockDarkMode: {
    set: ReturnType<typeof vi.fn>;
    reset: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockDarkMode = {
      set: vi.fn(),
      reset: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        ThemeService,
        {
          provide: TUI_DARK_MODE,
          useValue: mockDarkMode,
        },
      ],
    });

    service = TestBed.inject(ThemeService);
  });

  it('sets dark mode to true when theme is dark', () => {
    service.applyTheme('dark');
    expect(mockDarkMode.set).toHaveBeenCalledWith(true);
    expect(mockDarkMode.reset).not.toHaveBeenCalled();
  });

  it('sets dark mode to false when theme is light', () => {
    service.applyTheme('light');
    expect(mockDarkMode.set).toHaveBeenCalledWith(false);
    expect(mockDarkMode.reset).not.toHaveBeenCalled();
  });

  it('resets dark mode when theme is auto', () => {
    service.applyTheme('auto');
    expect(mockDarkMode.reset).toHaveBeenCalled();
    expect(mockDarkMode.set).not.toHaveBeenCalled();
  });
});
