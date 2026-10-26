import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { DownloadService } from '@core/services/download.service';
import {
  ITwoFactorRecoveryCodesDialogData,
  TwoFactorRecoveryCodesDialogComponent,
} from './two-factor-recovery-codes-dialog.component';

describe('TwoFactorRecoveryCodesDialogComponent', () => {
  let fixture: ComponentFixture<TwoFactorRecoveryCodesDialogComponent>;
  let component: TwoFactorRecoveryCodesDialogComponent;

  const mockContext = {
    data: {
      recoveryCodes: ['ABCD1-EFGH2', 'IJKL3-MNOP4'],
    } as ITwoFactorRecoveryCodesDialogData,
    completeWith: vi.fn(),
  };

  const mockDownloadService = {
    downloadUrl: vi.fn(),
  };

  const setup = async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [TwoFactorRecoveryCodesDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: mockContext },
        { provide: DownloadService, useValue: mockDownloadService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TwoFactorRecoveryCodesDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  it('renders recovery codes list from context', async () => {
    await setup();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('ABCD1-EFGH2');
    expect(compiled.textContent).toContain('IJKL3-MNOP4');
  });

  it('copies codes to clipboard when copyCodes is called', async () => {
    await setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    component['copyCodes']();
    expect(writeText).toHaveBeenCalledWith('ABCD1-EFGH2\nIJKL3-MNOP4');
  });

  it('delegates file download to DownloadService', async () => {
    await setup();
    component['downloadTxt']();

    expect(mockDownloadService.downloadUrl).toHaveBeenCalledWith(
      expect.stringContaining('blob:'),
      'konvoez-recovery-codes.txt',
    );
  });

  it('requires saved checkbox confirmation before closing', async () => {
    await setup();

    component['onClose']();
    expect(mockContext.completeWith).not.toHaveBeenCalled();

    component['saved'].set(true);
    component['onClose']();
    expect(mockContext.completeWith).toHaveBeenCalledOnce();
  });
});
