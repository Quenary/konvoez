import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  ISettingsDialogAdapter,
  TTranslator,
  THotkeyStatus,
} from '@konvoez/client-shell';
import type { TDesktopHotkeys } from '@konvoez/shared';
import { tokens } from '@konvoez/ui-kit/theme';
import { I18nController } from '@konvoez/ui-kit/i18n-controller';
import '@konvoez/ui-kit/k-dialog-layout';
import '@konvoez/ui-kit/k-dialog-actions';
import '@konvoez/ui-kit/k-hotkey-input';
import '@konvoez/ui-kit/k-checkbox';
import '@konvoez/ui-kit/k-message';
import '@konvoez/ui-kit/k-button';

export const SETTINGS_DIALOG_I18N_KEYS = [
  'settings.title',
  'settings.hotkeys',
  'settings.hotkeysHint',
  'settings.toggleMic',
  'settings.toggleSpeaker',
  'settings.pressKey',
  'settings.clear',
  'settings.autostart',
  'settings.save',
  'settings.saved',
  'settings.saveFailed',
  'hotkeys.ok',
  'hotkeys.conflict',
  'hotkeys.invalid',
  'hotkeys.unset',
] as const;

@customElement('k-settings-dialog')
export class KSettingsDialog extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        min-height: 100vh;
      }
      .section {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      h2.section-title {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--tui-text-primary);
      }
      p.hint-paragraph {
        margin: 0;
        font-size: 0.8125rem;
        color: var(--tui-text-tertiary);
        line-height: 1.4;
      }
      .hotkeys-group {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 0.5rem;
      }
    `,
  ];

  @property({ attribute: false })
  accessor adapter: ISettingsDialogAdapter | null = null;
  @property({ attribute: false }) accessor translator: TTranslator | null =
    null;

  @state() accessor micKey: string | null = null;
  @state() accessor speakerKey: string | null = null;
  @state() accessor autostart = false;

  @state() accessor micError = '';
  @state() accessor micHint = '';
  @state() accessor speakerError = '';
  @state() accessor speakerHint = '';

  @state() accessor loading = false;
  @state() accessor saveMessage: {
    variant: 'success' | 'error';
    text: string;
  } | null = null;

  private readonly i18n = new I18nController(this);

  override willUpdate(): void {
    this.i18n.setTranslator(this.translator ?? undefined);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    void this.loadInitial();
  }

  private async loadInitial(): Promise<void> {
    if (!this.adapter) return;
    try {
      const initial = await this.adapter.getInitial();
      if (initial.locale && this.translator) {
        this.translator.setLanguage(initial.locale);
      }
      this.micKey = initial.hotkeys.toggleMic;
      this.speakerKey = initial.hotkeys.toggleSpeaker;
      this.autostart = initial.autostart;
    } catch {
      // defaults
    }
  }

  private t(key: string, params?: Record<string, string | number>): string {
    return this.translator ? this.translator.t(key, params) : key;
  }

  private mapHotkeyStatus(status: THotkeyStatus): {
    error: string;
    hint: string;
  } {
    if (status === 'conflict' || status === 'invalid') {
      return { error: this.t(`hotkeys.${status}`), hint: '' };
    }
    if (status === 'ok' || status === 'unset') {
      return { error: '', hint: this.t(`hotkeys.${status}`) };
    }
    return { error: '', hint: '' };
  }

  private async handleSave(): Promise<void> {
    if (this.loading || !this.adapter) return;
    this.loading = true;
    this.saveMessage = null;
    this.micError = '';
    this.micHint = '';
    this.speakerError = '';
    this.speakerHint = '';

    const hotkeys: TDesktopHotkeys = {
      toggleMic: this.micKey,
      toggleSpeaker: this.speakerKey,
    };

    try {
      const res = await this.adapter.save({
        hotkeys,
        autostart: this.autostart,
      });
      this.loading = false;

      const micMapped = this.mapHotkeyStatus(res.hotkeys.toggleMic);
      this.micError = micMapped.error;
      this.micHint = micMapped.hint;

      const speakerMapped = this.mapHotkeyStatus(res.hotkeys.toggleSpeaker);
      this.speakerError = speakerMapped.error;
      this.speakerHint = speakerMapped.hint;

      this.saveMessage = {
        variant: 'success',
        text: this.t('settings.saved'),
      };
      this.dispatchEvent(
        new CustomEvent('k-saved', {
          bubbles: true,
          composed: true,
        }),
      );
    } catch {
      this.loading = false;
      this.saveMessage = {
        variant: 'error',
        text: this.t('settings.saveFailed'),
      };
    }
  }

  override render() {
    return html`
      <k-dialog-layout .heading="${this.t('settings.title')}">
        <section class="section">
          <h2 class="section-title">${this.t('settings.hotkeys')}</h2>
          <p class="hint-paragraph">${this.t('settings.hotkeysHint')}</p>

          <div class="hotkeys-group">
            <k-hotkey-input
              .label="${this.t('settings.toggleMic')}"
              .value="${this.micKey}"
              .recordingPlaceholder="${this.t('settings.pressKey')}"
              .clearHint="${this.t('settings.clear')}"
              .error="${this.micError}"
              .hint="${this.micHint}"
              @k-change="${(e: CustomEvent<{ value: string | null }>) => {
                this.micKey = e.detail.value;
              }}"
              @k-recording-start="${() => this.adapter?.suspendHotkeys()}"
              @k-recording-stop="${() => this.adapter?.resumeHotkeys()}"></k-hotkey-input>

            <k-hotkey-input
              .label="${this.t('settings.toggleSpeaker')}"
              .value="${this.speakerKey}"
              .recordingPlaceholder="${this.t('settings.pressKey')}"
              .clearHint="${this.t('settings.clear')}"
              .error="${this.speakerError}"
              .hint="${this.speakerHint}"
              @k-change="${(e: CustomEvent<{ value: string | null }>) => {
                this.speakerKey = e.detail.value;
              }}"
              @k-recording-start="${() => this.adapter?.suspendHotkeys()}"
              @k-recording-stop="${() => this.adapter?.resumeHotkeys()}"></k-hotkey-input>
          </div>
        </section>

        <section class="section">
          <k-checkbox
            .label="${this.t('settings.autostart')}"
            .checked="${this.autostart}"
            @k-change="${(e: CustomEvent<{ checked: boolean }>) => {
              this.autostart = e.detail.checked;
            }}"></k-checkbox>
        </section>

        ${
          this.saveMessage
            ? html`
                <k-message
                  .variant="${this.saveMessage.variant}"
                  .text="${this.saveMessage.text}"></k-message>
              `
            : ''
        }

        <k-dialog-actions
          slot="actions"
          align="end">
          <k-button
            variant="primary"
            ?loading="${this.loading}"
            ?disabled="${this.loading}"
            @k-click="${() => void this.handleSave()}">
            ${this.t('settings.save')}
          </k-button>
        </k-dialog-actions>
      </k-dialog-layout>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-settings-dialog': KSettingsDialog;
  }
}
