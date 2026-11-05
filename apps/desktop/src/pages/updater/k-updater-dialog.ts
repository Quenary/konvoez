import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  IUpdaterDialogAdapter,
  IUpdaterDialogInitial,
  IUpdaterProgress,
  IUpdaterState,
  TTranslator,
} from '@konvoez/client-shell';
import { I18nController } from '@konvoez/ui-kit/i18n-controller';
import '@konvoez/ui-kit/k-dialog-layout';
import '@konvoez/ui-kit/k-dialog-actions';
import '@konvoez/ui-kit/k-progress-bar';
import '@konvoez/ui-kit/k-message';
import '@konvoez/ui-kit/k-button';

export const UPDATER_DIALOG_I18N_KEYS = [
  'updater.updateAvailable',
  'updater.checking',
  'updater.upToDate',
  'updater.downloadAndUpdate',
  'updater.remindLater',
  'updater.downloading',
  'updater.downloadingHint',
  'updater.readyDeferred',
  'updater.ready',
  'updater.restartNow',
  'updater.later',
  'updater.close',
  'updater.retry',
  'updater.checkFailed',
  'updater.downloadFailed',
  'updater.disabled',
  'updater.version',
] as const;

function formatProgressDetails(progress?: IUpdaterProgress): string {
  if (!progress) return '';
  const parts: string[] = [];
  if (
    progress.transferred !== undefined &&
    progress.total !== undefined &&
    progress.total > 0
  ) {
    const transferredMb = (progress.transferred / (1024 * 1024)).toFixed(1);
    const totalMb = (progress.total / (1024 * 1024)).toFixed(1);
    parts.push(`${transferredMb} / ${totalMb} MB`);
  }
  if (progress.bytesPerSecond !== undefined && progress.bytesPerSecond > 0) {
    if (progress.bytesPerSecond >= 1024 * 1024) {
      const speedMb = (progress.bytesPerSecond / (1024 * 1024)).toFixed(1);
      parts.push(`${speedMb} MB/s`);
    } else {
      const speedKb = (progress.bytesPerSecond / 1024).toFixed(0);
      parts.push(`${speedKb} KB/s`);
    }
  }
  return parts.join(' • ');
}

@customElement('k-updater-dialog')
export class KUpdaterDialog extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 100%;
    }
    k-dialog-layout {
      flex: 1;
      min-height: 0;
    }
    p {
      margin: 0;
      font-size: 0.875rem;
      color: var(--tui-text-primary);
      line-height: 1.4;
    }
    p.secondary {
      color: var(--tui-text-secondary);
      font-size: 0.8125rem;
    }
    .content-column {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .progress-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8125rem;
      color: var(--tui-text-secondary);
    }
  `;

  @property({ attribute: false })
  accessor adapter: IUpdaterDialogAdapter | null = null;
  @property({ attribute: false }) accessor translator: TTranslator | null =
    null;
  @property({ attribute: false })
  accessor initial: IUpdaterDialogInitial | null = null;

  @state() accessor updaterState: IUpdaterState = { status: 'checking' };

  private readonly i18n = new I18nController(this);
  private initialLoaded = false;
  private unsubscribeState: (() => void) | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    if (this.adapter) {
      void this.loadInitial();
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.unsubscribeState) {
      this.unsubscribeState();
      this.unsubscribeState = null;
    }
    this.initialLoaded = false;
  }

  override render() {
    const status = this.updaterState.status;

    switch (status) {
      case 'checking':
        return html`
          <k-dialog-layout heading="${this.t('updater.checking')}">
            <div class="content-column">
              <k-progress-bar indeterminate></k-progress-bar>
              <p class="secondary">${this.t('updater.checking')}</p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleClose}">
                ${this.t('updater.close')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;

      case 'up-to-date':
        return html`
          <k-dialog-layout heading="Konvoez">
            <div class="content-column">
              <p>${this.t('updater.upToDate')}</p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleClose}">
                ${this.t('updater.close')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;

      case 'available': {
        const version = this.updaterState.version ?? '';
        return html`
          <k-dialog-layout heading="${this.t('updater.updateAvailable')}">
            <div class="content-column">
              <p>
                ${
                  version
                    ? this.t('updater.version', { version })
                    : this.t('updater.updateAvailable')
                }
              </p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleLater}">
                ${this.t('updater.remindLater')}
              </k-button>
              <k-button
                variant="primary"
                @k-click="${this.handleDownload}">
                ${this.t('updater.downloadAndUpdate')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;
      }

      case 'downloading': {
        const percent = this.updaterState.progress?.percent ?? 0;
        const details = formatProgressDetails(this.updaterState.progress);
        return html`
          <k-dialog-layout heading="${this.t('updater.downloading')}">
            <div class="content-column">
              <k-progress-bar
                .value="${percent}"
                .label="${percent}%"></k-progress-bar>
              ${
                details
                  ? html`<div class="progress-info">
                      <span>${details}</span>
                    </div>`
                  : ''
              }
              <p class="secondary">${this.t('updater.downloadingHint')}</p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleClose}">
                ${this.t('updater.close')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;
      }

      case 'ready-deferred':
        return html`
          <k-dialog-layout heading="${this.t('updater.ready')}">
            <div class="content-column">
              <p>${this.t('updater.readyDeferred')}</p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleLater}">
                ${this.t('updater.later')}
              </k-button>
              <k-button
                variant="primary"
                @k-click="${this.handleRestart}">
                ${this.t('updater.restartNow')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;

      case 'ready': {
        const version = this.updaterState.version ?? '';
        return html`
          <k-dialog-layout heading="Konvoez">
            <div class="content-column">
              <p>${this.t('updater.ready')}</p>
              ${
                version
                  ? html`<p class="secondary">
                      ${this.t('updater.version', { version })}
                    </p>`
                  : ''
              }
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleLater}">
                ${this.t('updater.later')}
              </k-button>
              <k-button
                variant="primary"
                @k-click="${this.handleRestart}">
                ${this.t('updater.restartNow')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;
      }

      case 'error': {
        const errorKey = this.updaterState.error || 'updater.checkFailed';
        return html`
          <k-dialog-layout heading="Konvoez">
            <div class="content-column">
              <k-message
                variant="error"
                .text="${this.t(errorKey)}"></k-message>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleClose}">
                ${this.t('updater.close')}
              </k-button>
              <k-button
                variant="primary"
                @k-click="${this.handleRetry}">
                ${this.t('updater.retry')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;
      }

      case 'disabled':
        return html`
          <k-dialog-layout heading="Konvoez">
            <div class="content-column">
              <p>${this.t('updater.disabled')}</p>
            </div>
            <k-dialog-actions
              slot="actions"
              align="end">
              <k-button
                variant="secondary"
                @k-click="${this.handleClose}">
                ${this.t('updater.close')}
              </k-button>
            </k-dialog-actions>
          </k-dialog-layout>
        `;
    }
  }

  protected override willUpdate(): void {
    this.i18n.setTranslator(this.translator ?? undefined);
  }

  protected override updated(changedProperties: PropertyValues<this>): void {
    super.updated(changedProperties);
    if (changedProperties.has('adapter') && this.adapter) {
      void this.loadInitial();
    }
  }

  private async loadInitial(): Promise<void> {
    if (!this.adapter || this.initialLoaded) return;
    this.initialLoaded = true;
    try {
      const initial = this.initial ?? (await this.adapter.getInitial());
      if (initial.locale && this.translator) {
        this.translator.setLanguage(initial.locale);
      }
      if (initial.state) {
        this.updaterState = initial.state;
      }
      this.unsubscribeState?.();
      this.unsubscribeState = this.adapter.onState((state) => {
        this.updaterState = state;
      });
    } catch {
      // defaults
    }
  }

  private t(key: string, params?: Record<string, string>): string {
    return this.translator ? this.translator.t(key, params) : key;
  }

  private handleClose(): void {
    this.adapter?.later();
  }

  private handleDownload(): void {
    this.adapter?.download();
  }

  private handleLater(): void {
    this.adapter?.later();
  }

  private handleRestart(): void {
    this.adapter?.restart();
  }

  private handleRetry(): void {
    this.adapter?.retry();
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-updater-dialog': KUpdaterDialog;
  }
}
