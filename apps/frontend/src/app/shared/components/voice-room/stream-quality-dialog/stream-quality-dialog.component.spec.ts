import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaDevicesService } from '@core/services/media-devices.service';
import { clearHardwareEncoderCache } from '@core/services/video-codec';
import { provideTranslateService } from '@ngx-translate/core';
import { TUI_ITEMS_HANDLERS, TuiDialogContext } from '@taiga-ui/core';
import { POLYMORPHEUS_CONTEXT } from '@taiga-ui/polymorpheus';
import {
  DEFAULT_STREAM_MAX_BITRATE_KBPS,
  STREAM_BITRATE_WARN_KBPS,
} from '@konvoez/shared';
import { EMPTY } from 'rxjs';
import {
  StreamQualityDialogComponent,
  TStreamQualityDialogData,
  TStreamQualityDialogResult,
} from './stream-quality-dialog.component';
import { StreamCameraPreviewComponent } from './stream-camera-preview.component';

function cameraDevice(deviceId: string, label = deviceId): MediaDeviceInfo {
  return {
    deviceId,
    kind: 'videoinput',
    label,
    groupId: 'g',
  } as MediaDeviceInfo;
}

function requestedDeviceId(constraints: MediaStreamConstraints): string | null {
  const video = constraints.video;
  if (!video || typeof video !== 'object' || !('deviceId' in video)) {
    return null;
  }
  const deviceId = video.deviceId;
  if (typeof deviceId === 'string') {
    return deviceId;
  }
  if (
    deviceId &&
    typeof deviceId === 'object' &&
    'ideal' in deviceId &&
    typeof deviceId.ideal === 'string'
  ) {
    return deviceId.ideal;
  }
  return null;
}

function previewStream(deviceId: string): MediaStream {
  const track = {
    readyState: 'live',
    stop: vi.fn(),
    getSettings: () => ({ deviceId }),
  };
  return {
    getVideoTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream;
}

function stubHardwareProbe(
  powerEfficient: (config: {
    video: { contentType: string; height: number };
  }) => Promise<boolean>,
): void {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0',
    mediaCapabilities: {
      encodingInfo: async (config: {
        video: { contentType: string; height: number };
      }) => ({
        supported: true,
        powerEfficient: await powerEfficient(config),
      }),
    },
  });
}

describe('StreamQualityDialogComponent', () => {
  let fixture: ComponentFixture<StreamQualityDialogComponent>;
  let component: StreamQualityDialogComponent;
  let completeWith: ReturnType<typeof vi.fn>;
  let data: TStreamQualityDialogData;
  let getUserMedia: ReturnType<typeof vi.fn>;
  let enumerateDevices: ReturnType<typeof vi.fn>;

  function cameraPreview(): StreamCameraPreviewComponent {
    return fixture.debugElement.query(
      By.directive(StreamCameraPreviewComponent),
    ).componentInstance;
  }

  async function setup(
    overrides: Partial<TStreamQualityDialogData> = {},
  ): Promise<void> {
    data = {
      kind: 'cam',
      height: 720,
      fps: 30,
      extraLayers: null,
      svcMode: null,
      bitrateKbps: 2500,
      contentMode: 'detail',
      codec: 'vp8',
      codecs: ['vp8', 'vp9'],
      maxBitrateKbps: DEFAULT_STREAM_MAX_BITRATE_KBPS,
      videoInput: null,
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
        {
          provide: MediaDevicesService,
          useValue: {
            getUserMedia,
            enumerateDevices,
            deviceChange$: EMPTY,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(StreamQualityDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    clearHardwareEncoderCache();
    getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) =>
      previewStream(requestedDeviceId(constraints) ?? 'cam-default'),
    );
    enumerateDevices = vi.fn(async () => [
      cameraDevice('cam-default', 'Default camera'),
    ]);
  });

  afterEach(() => {
    fixture?.destroy();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    clearHardwareEncoderCache();
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
    expect(component['extraLayers']()).toEqual([{ height: 480, fps: 60 }]);
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
    expect(component['extraLayers']()).toEqual([{ height: 360, fps: 60 }]);

    component['height'].set(480);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 160, fps: 60 }]);

    component['height'].set(360);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 160, fps: 60 }]);

    component['height'].set(1080);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 480, fps: 60 }]);

    component['fps'].set(30);
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 480, fps: 30 }]);
  });

  it('offers the same codec list for camera and screen and hides AV1', async () => {
    await setup({ codec: 'av1', codecs: ['vp8', 'vp9'] });
    expect(component['codec']()).toBe('vp9');
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
    expect(component['codec']()).toBe('vp9');
    expect(component['bitrateKbps']()).toBe(4250);
  });

  it('drops simulcast layers when stored H.264 falls back to VP9', async () => {
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
    expect(component['codec']()).toBe('vp9');
    expect(component['extraLayers']()).toEqual([]);
    expect(component['svcMode']()).toBe('L2T3_KEY');
    expect(component['bitrateKbps']()).toBe(4250);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).toBeNull();
  });

  it('preselects VP9 until the hardware probe resolves', async () => {
    await setup({
      codec: null,
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });
    expect(component['codec']()).toBe('vp9');
  });

  it('follows the frame size until the user picks a codec', async () => {
    vi.useFakeTimers();
    stubHardwareProbe(
      async (config) =>
        (config.video.height === 720 &&
          config.video.contentType === 'video/AV1') ||
        (config.video.height === 1080 &&
          config.video.contentType.startsWith('video/H264')),
    );
    await setup({
      codec: null,
      height: 720,
      fps: 30,
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });

    const stringify = fixture.componentRef.injector
      .get(TUI_ITEMS_HANDLERS)
      .stringify();
    await vi.advanceTimersByTimeAsync(200);
    expect(component['codec']()).toBe('av1');
    expect(stringify('av1')).toBe('AV1 (CALL.STREAM_CODEC_HARDWARE)');
    expect(stringify('h264')).toBe('H.264');

    component['height'].set(1080);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    expect(component['codec']()).toBe('h264');
    expect(stringify('h264')).toBe('H.264 (CALL.STREAM_CODEC_HARDWARE)');

    component['onCodecChange']('vp9');
    component['height'].set(720);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(200);
    expect(component['codec']()).toBe('vp9');
    expect(stringify('av1')).toBe('AV1 (CALL.STREAM_CODEC_HARDWARE)');
  });

  it('keeps a saved codec and still marks the hardware option', async () => {
    vi.useFakeTimers();
    stubHardwareProbe(
      async (config) => config.video.contentType === 'video/AV1',
    );
    await setup({
      codec: 'vp9',
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });

    const stringify = fixture.componentRef.injector
      .get(TUI_ITEMS_HANDLERS)
      .stringify();
    await vi.advanceTimersByTimeAsync(200);
    expect(component['codec']()).toBe('vp9');
    expect(stringify('av1')).toBe('AV1 (CALL.STREAM_CODEC_HARDWARE)');
    expect(stringify('h264')).toBe('H.264');
  });

  it('resolves the hardware codec before confirming', async () => {
    vi.useFakeTimers();
    stubHardwareProbe(
      async (config) => config.video.contentType === 'video/AV1',
    );
    await setup({
      kind: 'screen',
      codec: null,
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });

    const pending = component['onConfirm']();
    await vi.advanceTimersByTimeAsync(0);
    await pending;

    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'av1' }),
    );
  });

  it('ignores a second confirm until the probe finishes', async () => {
    vi.useFakeTimers();
    let releaseAv1: ((value: boolean) => void) | undefined;
    stubHardwareProbe(
      (config) =>
        new Promise((resolve) => {
          if (config.video.contentType === 'video/AV1' && releaseAv1 == null) {
            releaseAv1 = resolve;
            return;
          }
          resolve(config.video.contentType === 'video/AV1');
        }),
    );
    await setup({
      kind: 'screen',
      codec: null,
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });

    const first = component['onConfirm']();
    const second = component['onConfirm']();
    releaseAv1?.(true);
    await vi.advanceTimersByTimeAsync(0);
    await first;
    await second;

    expect(completeWith).toHaveBeenCalledTimes(1);
    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'av1' }),
    );
  });

  it('confirms the codec for the size chosen while the probe is in flight', async () => {
    vi.useFakeTimers();
    let deferAv1 = true;
    let releaseAv1: (() => void) | undefined;
    stubHardwareProbe(
      (config) =>
        new Promise((resolve) => {
          const hardware =
            (config.video.height === 720 &&
              config.video.contentType === 'video/AV1') ||
            (config.video.height === 1080 &&
              config.video.contentType.startsWith('video/H264'));
          if (deferAv1 && config.video.contentType === 'video/AV1') {
            deferAv1 = false;
            releaseAv1 = () => resolve(hardware);
            return;
          }
          resolve(hardware);
        }),
    );
    await setup({
      kind: 'screen',
      codec: null,
      height: 720,
      fps: 30,
      codecs: ['av1', 'h264', 'vp9', 'vp8'],
    });

    const pending = component['onConfirm']();
    const releaseFirst = releaseAv1;
    component['height'].set(1080);
    fixture.detectChanges();
    releaseFirst?.();
    await vi.advanceTimersByTimeAsync(0);
    await pending;

    expect(completeWith).toHaveBeenCalledTimes(1);
    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({ codec: 'h264', height: 1080 }),
    );
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
    expect(component['svcMode']()).toBe('L2T3_KEY');
    expect(component['bitrateKbps']()).toBe(4250);
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'CALL.STREAM_SVC_LAYERS',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'CALL.STREAM_SVC_LAYERS_HINT',
    );

    component['codec'].set('av1');
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([]);
    expect(component['svcMode']()).toBe('L2T3_KEY');
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).toBeNull();

    component['codec'].set('vp8');
    fixture.detectChanges();
    expect(component['extraLayers']()).toEqual([{ height: 480, fps: 30 }]);
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
    expect(component['bitrateKbps']()).toBe(4250);

    component['codec'].set('av1');
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(3000);
    expect(component['bitrateKbps']()).toBeLessThan(4250);
  });

  it('keeps the SVC mode across VP9 and AV1 and resets it at the simulcast boundary', async () => {
    await setup({
      kind: 'screen',
      height: 1080,
      fps: 30,
      extraLayers: [],
      svcMode: 'L3T3_KEY',
      bitrateKbps: null,
      contentMode: 'detail',
      codec: 'vp9',
      codecs: ['vp8', 'vp9', 'av1'],
      maxBitrateKbps: 20000,
    });
    expect(component['svcMode']()).toBe('L3T3_KEY');
    expect(component['bitrateKbps']()).toBe(4750);
    expect(fixture.nativeElement.textContent).toContain(
      'CALL.STREAM_SVC_LAYERS',
    );

    component['height'].set(720);
    fixture.detectChanges();
    expect(component['svcMode']()).toBe('L3T3_KEY');

    component['codec'].set('av1');
    fixture.detectChanges();
    expect(component['svcMode']()).toBe('L3T3_KEY');

    component['svcMode'].set('L1T3');
    fixture.detectChanges();
    expect(component['bitrateKbps']()).toBe(1250);

    component['codec'].set('vp8');
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('tui-textfield[multi]'),
    ).not.toBeNull();

    component['codec'].set('vp9');
    fixture.detectChanges();
    expect(component['svcMode']()).toBe('L2T3_KEY');
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
    await component['onConfirm']();
    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({
        extraLayers: component['extraLayers'](),
        svcMode: component['svcMode'](),
        bitrateKbps: 8000,
        codec: 'vp8',
        contentMode: 'motion',
      }),
    );
  });

  it('confirms the selected camera and releases the preview when the dialog closes', async () => {
    vi.useFakeTimers();
    const events: string[] = [];
    getUserMedia.mockImplementation(
      async (constraints: MediaStreamConstraints) => {
        const deviceId = requestedDeviceId(constraints) ?? 'cam-default';
        const track = {
          readyState: 'live',
          stop: () => {
            events.push('stop');
          },
          getSettings: () => ({ deviceId }),
        };
        return {
          getVideoTracks: () => [track],
          getTracks: () => [track],
        };
      },
    );
    completeWith = vi.fn();
    await setup();
    completeWith.mockImplementation(() => {
      events.push('complete');
    });
    await vi.advanceTimersByTimeAsync(200);
    fixture.detectChanges();
    events.length = 0;

    await component['onConfirm']();

    expect(events).toEqual(['complete']);
    expect(cameraPreview()['previewTrack']()).not.toBeNull();
    expect(completeWith).toHaveBeenCalledWith(
      expect.objectContaining({
        videoInput: expect.objectContaining({ deviceId: 'cam-default' }),
      }),
    );

    fixture.destroy();
    expect(events).toEqual(['complete', 'stop']);
  });

  it('stops a live preview when the dialog is destroyed', async () => {
    vi.useFakeTimers();
    const stop = vi.fn();
    getUserMedia.mockImplementation(
      async (constraints: MediaStreamConstraints) => {
        const deviceId = requestedDeviceId(constraints) ?? 'cam-default';
        const track = {
          readyState: 'live',
          stop,
          getSettings: () => ({ deviceId }),
        };
        return {
          getVideoTracks: () => [track],
          getTracks: () => [track],
        };
      },
    );
    await setup();
    await vi.advanceTimersByTimeAsync(200);
    expect(cameraPreview()['previewTrack']()).not.toBeNull();

    fixture.destroy();

    expect(stop).toHaveBeenCalled();
  });

  it('does not open a camera for screen share', async () => {
    vi.useFakeTimers();
    await setup({ kind: 'screen' });
    await vi.advanceTimersByTimeAsync(500);

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('video')).toBeNull();
  });
});
