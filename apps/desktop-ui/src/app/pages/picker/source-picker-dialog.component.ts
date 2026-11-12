import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  TUI_ITEMS_HANDLERS,
  TuiButton,
  TuiDropdown,
  TuiLabel,
  TuiTextfield,
} from '@taiga-ui/core';
import { TuiCheckbox } from '@taiga-ui/core/components/checkbox';
import {
  TuiChevron,
  TuiDataListWrapper,
  TuiSelect,
  TuiTab,
  TuiTabs,
} from '@taiga-ui/kit';
import type {
  IAudioStreamInfo,
  ISerializableSource,
} from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../app.config';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';
import { SourceGridComponent } from '../../components/source-grid/source-grid.component';

class AudioStreamLabels {
  private readonly desktopI18nService = inject(DesktopI18nService);

  public readonly streams = signal<IAudioStreamInfo[]>([]);

  public label(id: string): string {
    if (!id) {
      return this.desktopI18nService.translate('picker.allAudio');
    }
    return this.streams().find((stream) => stream.id === id)?.name ?? id;
  }
}

@Component({
  selector: 'app-source-picker-dialog',
  imports: [
    DialogLayoutComponent,
    FormsModule,
    I18nPipe,
    SourceGridComponent,
    TuiButton,
    TuiCheckbox,
    TuiChevron,
    TuiDataListWrapper,
    TuiDropdown,
    TuiLabel,
    TuiSelect,
    TuiTab,
    TuiTabs,
    TuiTextfield,
  ],
  providers: [
    AudioStreamLabels,
    {
      provide: TUI_ITEMS_HANDLERS,
      useFactory: () => {
        const labels = inject(AudioStreamLabels);
        return {
          stringify: signal((id: string) => labels.label(id)),
          identityMatcher: signal((a: string, b: string) => a === b),
          disabledItemHandler: signal(() => false),
        };
      },
    },
  ],
  templateUrl: './source-picker-dialog.component.html',
  styleUrl: './source-picker-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcePickerDialogComponent implements OnInit {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);
  private readonly audioStreamLabels = inject(AudioStreamLabels);

  public readonly picked = output<{
    sourceId: string | null;
    withAudio: boolean;
    audioStreamId?: string;
  }>();
  public readonly cancelled = output<void>();

  public readonly activeTabIndex = signal<number>(0);
  public readonly activeTab = signal<'screens' | 'windows'>('screens');
  public readonly sources = signal<ISerializableSource[]>([]);
  public readonly selectedId = signal<string | null>(null);
  public readonly shareAudio = signal<boolean>(true);
  public readonly audioSupported = signal<boolean>(true);
  public readonly nativeAudio = signal<boolean>(false);
  public readonly audioStreams = signal<IAudioStreamInfo[]>([]);
  public readonly selectedAudioStreamId = signal<string>('');

  public readonly currentSources = computed(() => {
    const isScreens = this.activeTab() === 'screens';
    return this.sources().filter((s) =>
      isScreens ? !s.id.startsWith('window:') : s.id.startsWith('window:'),
    );
  });

  public readonly showLoopbackHint = computed(() => {
    return this.audioSupported() && !this.nativeAudio();
  });

  public readonly showAudioStreamSelect = computed(() => {
    return (
      this.shareAudio() &&
      this.activeTab() === 'windows' &&
      this.audioStreams().length > 0
    );
  });

  public readonly audioStreamIds = computed(() => [
    '',
    ...this.audioStreams().map((stream) => stream.id),
  ]);

  public async ngOnInit(): Promise<void> {
    try {
      const initial = await this.konvoezLocalBridge.picker.getInitial();
      if (initial.locale) {
        this.desktopI18nService.setLanguage(initial.locale);
      }
      this.sources.set(initial.sources);
      this.shareAudio.set(initial.shareAudio);
      this.audioSupported.set(initial.audioSupported);
      this.nativeAudio.set(initial.nativeAudio);
      this.audioStreams.set(initial.audioStreams ?? []);
      this.audioStreamLabels.streams.set(initial.audioStreams ?? []);
      this.selectedAudioStreamId.set('');

      const current = this.currentSources();
      this.selectedId.set(current.length > 0 ? current[0].id : null);
    } catch {
      // defaults
    }
  }

  public handleShare(): void {
    const selId = this.selectedId();
    if (!selId) return;

    const withAudio = this.audioSupported() ? this.shareAudio() : false;
    const streamId = this.selectedAudioStreamId();

    if (streamId) {
      this.konvoezLocalBridge.picker.pick(selId, withAudio, streamId);
      this.picked.emit({ sourceId: selId, withAudio, audioStreamId: streamId });
    } else {
      this.konvoezLocalBridge.picker.pick(selId, withAudio);
      this.picked.emit({ sourceId: selId, withAudio });
    }
  }

  public handleCancel(): void {
    const withAudio = this.audioSupported() ? this.shareAudio() : false;
    this.konvoezLocalBridge.picker.pick(null, withAudio);
    this.cancelled.emit();
  }

  protected onActiveTabIndexChange(index: number): void {
    const tab = index === 1 ? 'windows' : 'screens';
    if (this.activeTabIndex() === index && this.activeTab() === tab) {
      return;
    }
    this.activeTabIndex.set(index);
    this.activeTab.set(tab);
    const current = this.currentSources();
    this.selectedId.set(current.length > 0 ? current[0].id : null);
    this.selectedAudioStreamId.set('');
  }

  protected handleTabChange(tab: 'screens' | 'windows'): void {
    const index = tab === 'screens' ? 0 : 1;
    this.onActiveTabIndexChange(index);
  }

  protected onSourceSelected(sourceId: string): void {
    this.selectedId.set(sourceId);
    this.selectedAudioStreamId.set('');
  }

  protected onSourceActivated(sourceId: string): void {
    this.selectedId.set(sourceId);
    this.selectedAudioStreamId.set('');
    this.handleShare();
  }

  protected handleAudioToggle(shareAudio: boolean): void {
    this.konvoezLocalBridge.picker.setShareAudio(shareAudio);
  }
}
