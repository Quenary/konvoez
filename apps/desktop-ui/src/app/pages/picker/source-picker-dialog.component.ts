import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TuiButton } from '@taiga-ui/core';
import { TuiCheckbox } from '@taiga-ui/core/components/checkbox';
import { TuiTab, TuiTabs } from '@taiga-ui/kit';
import type {
  IAudioStreamInfo,
  ISerializableSource,
} from '@konvoez/client-shell';
import { KONVOEZ_LOCAL_BRIDGE } from '../../core/tokens/local-bridge.token';
import { DesktopI18nService } from '../../core/i18n/desktop-i18n.service';
import { I18nPipe } from '../../core/i18n/i18n.pipe';
import { DialogLayoutComponent } from '../../components/dialog-layout/dialog-layout.component';
import { SourceGridComponent } from '../../components/source-grid/source-grid.component';

@Component({
  selector: 'app-source-picker-dialog',
  imports: [
    DialogLayoutComponent,
    I18nPipe,
    SourceGridComponent,
    TuiButton,
    TuiCheckbox,
    TuiTab,
    TuiTabs,
  ],
  templateUrl: './source-picker-dialog.component.html',
  styleUrl: './source-picker-dialog.component.scss',
  host: {
    '(window:keydown)': 'handleWindowKeyDown($event)',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SourcePickerDialogComponent implements OnInit {
  private readonly konvoezLocalBridge = inject(KONVOEZ_LOCAL_BRIDGE);
  private readonly desktopI18nService = inject(DesktopI18nService);

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
  public readonly selectedAudioStreamId = signal<string | null>(null);

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
      this.selectedAudioStreamId.set(null);

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
    this.selectedAudioStreamId.set(null);
  }

  protected handleArrowNavigation(step: number): void {
    const currentIndex = this.activeTabIndex();
    const nextIndex = Math.max(0, Math.min(1, currentIndex + step));
    if (nextIndex !== currentIndex) {
      this.onActiveTabIndexChange(nextIndex);
    }
  }

  protected handleTabChange(tab: 'screens' | 'windows'): void {
    const index = tab === 'screens' ? 0 : 1;
    this.onActiveTabIndexChange(index);
  }

  protected onSourceSelected(sourceId: string): void {
    this.selectedId.set(sourceId);
    this.selectedAudioStreamId.set(null);
  }

  protected onSourceActivated(sourceId: string): void {
    this.selectedId.set(sourceId);
    this.selectedAudioStreamId.set(null);
    this.handleShare();
  }

  protected handleAudioToggle(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.shareAudio.set(input.checked);
    this.konvoezLocalBridge.picker.setShareAudio(input.checked);
  }

  protected handleStreamSelect(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.selectedAudioStreamId.set(select.value || null);
  }

  protected handleWindowKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.handleCancel();
    }
  }
}
