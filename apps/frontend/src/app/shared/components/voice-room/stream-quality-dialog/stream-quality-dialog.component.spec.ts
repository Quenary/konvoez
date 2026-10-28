import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogContext } from '@taiga-ui/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import { STREAM_BITRATE_WARN_KBPS } from '@konvoez/shared';
import {
  StreamQualityDialogComponent,
  TStreamQualityDialogData,
  TStreamQualityDialogResult,
} from './stream-quality-dialog.component';

describe('StreamQualityDialogComponent', () => {
  let fixture: ComponentFixture<StreamQualityDialogComponent>;
  let component: StreamQualityDialogComponent;
  let completeWith: ReturnType<typeof vi.fn>;
  let data: TStreamQualityDialogData;

  async function setup(
    overrides: Partial<TStreamQualityDialogData> = {},
  ): Promise<void> {
    data = {
      kind: 'cam',
      height: 720,
      fps: 30,
      layers: 2,
      bitrateKbps: 2500,
      contentMode: 'detail',
      maxBitrateKbps: 10000,
      ...overrides,
    };
    completeWith = vi.fn();
    const context = {
      data,
      completeWith,
    } as unknown as TuiDialogContext<
      TStreamQualityDialogResult | null,
      TStreamQualityDialogData
    >;

    await TestBed.configureTestingModule({
      imports: [StreamQualityDialogComponent],
      providers: [
        provideTranslateService(),
        { provide: POLYMORPHEUS_CONTEXT, useValue: context },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamQualityDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('follows the height when clamping layers and summarizing them', async () => {
    await setup({ height: 1080, layers: 3 });
    expect(component['maxLayers']()).toBe(3);
    expect(component['layerLines']().map((layer) => layer.height)).toEqual([
      1080, 540, 270,
    ]);

    component['height'].set(360);
    fixture.detectChanges();
    expect(component['maxLayers']()).toBe(2);
    expect(component['layers']()).toBeLessThanOrEqual(2);
  });

  it('renders the content radio only for screen share', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('tui-radio-list')).toBeNull();

    TestBed.resetTestingModule();
    await setup({ kind: 'screen' });
    expect(fixture.nativeElement.querySelector('tui-radio-list')).toBeTruthy();
  });

  it('resets bitrate when height changes and warns above the threshold', async () => {
    await setup({ bitrateKbps: 2500, maxBitrateKbps: 20000 });
    expect(component['bitrateKbps']()).toBe(2500);
    expect(component['showBitrateWarning']()).toBe(false);

    component['height'].set(1080);
    fixture.detectChanges();
    expect(component['bitrateKbps']()).not.toBe(2500);
    expect(component['showBitrateWarning']()).toBe(
      component['bitrateKbps']() > STREAM_BITRATE_WARN_KBPS,
    );

    component['bitrateKbps'].set(20000);
    fixture.detectChanges();
    expect(component['showBitrateWarning']()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'CALL.STREAM_BITRATE_WARNING',
    );
  });

  it('returns the new fields and never exceeds the admin limit', async () => {
    await setup({
      kind: 'screen',
      bitrateKbps: 50000,
      maxBitrateKbps: 8000,
      contentMode: 'motion',
    });
    expect(component['bitrateKbps']()).toBe(8000);
    component['onConfirm']();
    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({
        layers: component['layers'](),
        bitrateKbps: 8000,
        contentMode: 'motion',
      }),
    );
  });
});
