import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ISourcePickerDialogAdapter,
  ISerializableSource,
  TTranslator,
} from '@konvoez/client-shell';
import { tokens } from '@konvoez/ui-kit/theme';
import { I18nController } from '@konvoez/ui-kit/i18n-controller';
import '@konvoez/ui-kit/k-dialog-layout';
import '@konvoez/ui-kit/k-dialog-actions';
import '@konvoez/ui-kit/k-tabs';
import '@konvoez/ui-kit/k-source-grid';
import '@konvoez/ui-kit/k-checkbox';
import '@konvoez/ui-kit/k-button';

export const PICKER_DIALOG_I18N_KEYS = [
  'picker.title',
  'picker.screens',
  'picker.windows',
  'picker.cancel',
  'picker.share',
  'picker.noScreens',
  'picker.noWindows',
  'picker.shareAudio',
  'picker.shareAudioHint',
] as const;
export const SOURCE_PICKER_DIALOG_I18N_KEYS = PICKER_DIALOG_I18N_KEYS;

@customElement('k-source-picker-dialog')
export class KSourcePickerDialog extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        min-height: 100vh;
      }
      .audio-section {
        flex: 1;
      }
      .audio-hint {
        margin: 0;
        font-size: 0.75rem;
        color: var(--tui-text-tertiary);
        line-height: 1.35;
      }
      .button-group {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
    `,
  ];

  @property({ attribute: false })
  accessor adapter: ISourcePickerDialogAdapter | null = null;
  @property({ attribute: false }) accessor translator: TTranslator | null =
    null;

  @state() accessor activeTab: 'screens' | 'windows' = 'screens';
  @state() accessor sources: ISerializableSource[] = [];
  @state() accessor selectedId: string | null = null;
  @state() accessor shareAudio = true;
  @state() accessor audioSupported = true;

  private readonly i18n = new I18nController(this);
  private initialLoaded = false;

  override willUpdate(): void {
    this.i18n.setTranslator(this.translator ?? undefined);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleWindowKeyDown);
    if (this.adapter) {
      void this.loadInitial();
    }
  }

  override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);
    if (changedProperties.has('adapter') && this.adapter) {
      void this.loadInitial();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleWindowKeyDown);
  }

  private async loadInitial(): Promise<void> {
    if (!this.adapter || this.initialLoaded) return;
    this.initialLoaded = true;
    try {
      const initial = await this.adapter.getInitial();
      if (initial.locale && this.translator) {
        this.translator.setLanguage(initial.locale);
      }
      this.sources = initial.sources;
      this.shareAudio = initial.shareAudio;
      this.audioSupported = initial.audioSupported;

      const current = this.currentSources;
      this.selectedId = current.length > 0 ? current[0].id : null;
    } catch {
      // defaults
    }
  }

  private t(key: string, params?: Record<string, string>): string {
    return this.translator ? this.translator.t(key, params) : key;
  }

  get currentSources(): ISerializableSource[] {
    return this.sources.filter((s) =>
      this.activeTab === 'screens'
        ? !s.id.startsWith('window:')
        : s.id.startsWith('window:'),
    );
  }

  private handleTabChange(tabId: string): void {
    this.activeTab = tabId as 'screens' | 'windows';
    const current = this.currentSources;
    this.selectedId = current.length > 0 ? current[0].id : null;
  }

  private handleAudioChange(checked: boolean): void {
    this.shareAudio = checked;
    this.adapter?.setShareAudio(checked);
  }

  private handleShare(): void {
    if (!this.selectedId) return;
    const withAudio = this.audioSupported ? this.shareAudio : false;
    this.adapter?.pick(this.selectedId, withAudio);
    this.dispatchEvent(
      new CustomEvent('k-picked', {
        bubbles: true,
        composed: true,
        detail: { sourceId: this.selectedId, withAudio },
      }),
    );
  }

  private handleCancel(): void {
    const withAudio = this.audioSupported ? this.shareAudio : false;
    this.adapter?.pick(null, withAudio);
    this.dispatchEvent(
      new CustomEvent('k-cancelled', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleWindowKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.handleCancel();
    }
  };

  override render() {
    const current = this.currentSources;
    const tabs = [
      { id: 'screens', label: this.t('picker.screens') },
      { id: 'windows', label: this.t('picker.windows') },
    ];
    const emptyText =
      this.activeTab === 'screens'
        ? this.t('picker.noScreens')
        : this.t('picker.noWindows');

    return html`
      <k-dialog-layout .heading="${this.t('picker.title')}">
        <k-tabs
          .tabs="${tabs}"
          .value="${this.activeTab}"
          @k-change="${(e: CustomEvent<{ value: string }>) =>
            this.handleTabChange(e.detail.value)}"></k-tabs>

        <k-source-grid
          .sources="${current}"
          .value="${this.selectedId}"
          @k-select="${(e: CustomEvent<{ sourceId: string }>) => {
            this.selectedId = e.detail.sourceId;
          }}"
          @k-activate="${(e: CustomEvent<{ sourceId: string }>) => {
            this.selectedId = e.detail.sourceId;
            this.handleShare();
          }}">
          <div slot="empty">${emptyText}</div>
        </k-source-grid>

        <k-dialog-actions
          slot="actions"
          align="between">
          <div class="audio-section">
            ${
              this.audioSupported
                ? html`
                    <k-checkbox
                      .label="${this.t('picker.shareAudio')}"
                      .hint="${this.t('picker.shareAudioHint')}"
                      .checked="${this.shareAudio}"
                      @k-change="${(e: CustomEvent<{ checked: boolean }>) =>
                        this.handleAudioChange(e.detail.checked)}"></k-checkbox>
                  `
                : html`
                    <p class="audio-hint">${this.t('picker.shareAudioHint')}</p>
                  `
            }
          </div>

          <div class="button-group">
            <k-button
              variant="secondary"
              @k-click="${() => this.handleCancel()}">
              ${this.t('picker.cancel')}
            </k-button>
            <k-button
              variant="primary"
              ?disabled="${!this.selectedId}"
              @k-click="${() => this.handleShare()}">
              ${this.t('picker.share')}
            </k-button>
          </div>
        </k-dialog-actions>
      </k-dialog-layout>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-source-picker-dialog': KSourcePickerDialog;
  }
}
