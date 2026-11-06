import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { TuiDialogContext } from '@taiga-ui/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import {
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  STREAM_BITRATE_WARN_KBPS,
} from '@konvoez/shared';
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
      extraLayers: null,
      bitrateKbps: 2500,
      contentMode: 'detail',
      codec: 'vp8',
      codecs: ['vp8', 'vp9'],
      maxBitrateKbps: DEFAULT_STREAM_MAX_BITRATE_KBPS,
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

  it('lists 1080p60 options and selects the default layer', async () => {
    await setup({ height: 1080, fps: 60, extraLayers: null });
    expect(
      component['layerOptions']().map(
        (layer) => `${layer.height}p${layer.fps}`,
      ),
    ).toEqual([
      '1080p30',
      '720p60',
      '720p30',
      '480p60',
      '480p30',
      '360p60',
      '360p30',
      '160p60',
      '160p30',
    ]);
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 60 }]);
    expect(
      fixture.nativeElement.querySelector('select[tuiMultiSelect]'),
    ).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain(
      'CALL.STREAM_LAYERS_RESULT',
    );
  });

  it('disables unselected options after two layers are chosen', async () => {
    await setup({
      height: 1080,
      fps: 60,
      extraLayers: [
        { height: 720, fps: 60 },
        { height: 480, fps: 30 },
      ],
    });
    const options = component['layerOptions']();
    const unselected = options.filter((layer) =>
      component['extraLayerDisabled'](layer),
    );
    expect(unselected.length).toBe(options.length - 2);
    expect(component['extraLayerDisabled']({ height: 720, fps: 60 })).toBe(
      false,
    );
    const rendered = [
      ...fixture.nativeElement.querySelectorAll(
        'select[tuiMultiSelect] option',
      ),
    ] as HTMLOptionElement[];
    expect(rendered.filter((option) => option.disabled).length).toBe(
      unselected.length,
    );
  });

  it('selects the next lower preset when the max changes in either direction', async () => {
    await setup({
      height: 1080,
      fps: 60,
      extraLayers: [
        { height: 720, fps: 60 },
        { height: 160, fps: 30 },
      ],
    });
    expect(component['extraLayers']()).toEqual([
      { height: 720, fps: 60 },
      { height: 160, fps: 30 },
    ]);

    component['height'].set(720);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 480, fps: 60 }]);

    component['height'].set(480);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 360, fps: 60 }]);

    component['height'].set(360);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 160, fps: 60 }]);

    component['height'].set(1080);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 60 }]);

    component['fps'].set(30);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 30 }]);
  });

  it('offers the same codec list for camera and screen and hides AV1', async () => {
    await setup({ codec: 'av1', codecs: ['vp8', 'vp9'] });
    expect(component['codec']()).toBe('vp8');
    expect(fixture.nativeElement.textContent).toContain('CALL.STREAM_CODEC');

    TestBed.resetTestingModule();
    await setup({
      kind: 'screen',
      codecs: ['vp8', 'vp9', 'av1'],
      codec: 'av1',
    });
    expect(component['codec']()).toBe('av1');
    expect(fixture.nativeElement.textContent).toContain('CALL.STREAM_CODEC');
  });

  it('recomputes bitrate when the stored codec is not available', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [],
      bitrateKbps: 2500,
      contentMode: 'detail',
      codec: 'av1',
      codecs: ['vp8', 'vp9'],
      maxBitrateKbps: 20000,
    });
    expect(component['codec']()).toBe('vp8');
    expect(component['bitrateKbps']()).toBe(5000);
  });

  it('keeps layers when stored H.264 falls back to VP8', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [{ height: 720, fps: 30 }],
      bitrateKbps: 8000,
      contentMode: 'detail',
      codec: 'h264',
      codecs: ['vp8', 'vp9'],
      maxBitrateKbps: 20000,
    });
    expect(component['codec']()).toBe('vp8');
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 30 }]);
    expect(component['bitrateKbps']()).toBe(8000);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).not.toBeNull();
  });

  it('keeps extra layers for H.264', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [{ height: 720, fps: 30 }],
      bitrateKbps: 7500,
      contentMode: 'detail',
      codec: 'h264',
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
      maxBitrateKbps: 20000,
    });
    expect(component['codecs'][0]).toBe('av1');
    expect(component['codec']()).toBe('h264');
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 30 }]);
  });

  it('clears extra layers when the codec cannot use simulcast', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [{ height: 720, fps: 30 }],
      bitrateKbps: 8000,
      contentMode: 'detail',
      codec: 'vp9',
      codecs: ['vp8', 'vp9', 'av1'],
      maxBitrateKbps: 20000,
    });
    expect(component['extraLayers']()).toEqual([]);
    expect(component['bitrateKbps']()).toBe(3500);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).toBeNull();

    component['codec'].set('av1');
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([]);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).toBeNull();

    component['codec'].set('vp8');
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 720, fps: 30 }]);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).not.toBeNull();
  });

  it('lowers the recommended bitrate when the codec changes', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [],
      bitrateKbps: null,
      contentMode: 'detail',
      codec: 'vp8',
      maxBitrateKbps: 20000,
    });
    expect(component['bitrateKbps']()).toBe(5000);

    component['codec'].set('vp9');
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(3500);

    component['codec'].set('av1');
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(2500);
    expect(component['bitrateKbps']()).toBeLessThan(3500);
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

  it('raises and lowers bitrate when extra layers change', async () => {
    await setup({
      height: 1080,
      fps: 60,
      extraLayers: [],
      bitrateKbps: 10500,
      maxBitrateKbps: 20000,
    });
    expect(component['bitrateKbps']()).toBe(10500);

    component['onExtraLayersChange']([{ height: 1080, fps: 30 }]);
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(18000);

    component['onExtraLayersChange']([]);
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(10500);
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
        extraLayers: component['extraLayers'](),
        bitrateKbps: 8000,
        codec: 'vp8',
        contentMode: 'motion',
      }),
    );
  });
});
