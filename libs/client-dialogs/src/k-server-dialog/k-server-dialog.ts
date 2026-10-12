import { LitElement, css, html, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type {
  IServerDialogAdapter,
  IServerDialogInitial,
  TTranslator,
} from '@konvoez/client-shell';
import { tokens } from '@konvoez/ui-kit/theme';
import { I18nController } from '@konvoez/ui-kit/i18n-controller';
import '@konvoez/ui-kit/k-dialog-layout';
import '@konvoez/ui-kit/k-dialog-actions';
import '@konvoez/ui-kit/k-input';
import '@konvoez/ui-kit/k-button';

export const SERVER_DIALOG_I18N_KEYS = [
  'server.title',
  'server.subtitle',
  'server.placeholder',
  'server.connect',
  'server.connecting',
  'server.errorInsecure',
  'server.errorInvalid',
  'server.errorUnreachable',
] as const;

@customElement('k-server-dialog')
export class KServerDialog extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        min-height: 100vh;
      }
      p.subtitle {
        margin: 0 0 0.5rem 0;
        font-size: 0.875rem;
        color: var(--tui-text-secondary);
        line-height: 1.4;
      }
    `,
  ];

  @property({ attribute: false })
  accessor adapter: IServerDialogAdapter | null = null;
  @property({ attribute: false }) accessor translator: TTranslator | null =
    null;
  @property({ attribute: false })
  accessor initial: IServerDialogInitial | null = null;

  @state() accessor serverUrl = '';
  @state() accessor loading = false;
  @state() accessor error = '';

  private readonly i18n = new I18nController(this);
  private initialLoaded = false;

  override willUpdate(): void {
    this.i18n.setTranslator(this.translator ?? undefined);
  }

  override connectedCallback(): void {
    super.connectedCallback();
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

  private async loadInitial(): Promise<void> {
    if (!this.adapter || this.initialLoaded) return;
    this.initialLoaded = true;
    try {
      const initial = this.initial ?? (await this.adapter.getInitial());
      if (initial.locale && this.translator) {
        this.translator.setLanguage(initial.locale);
      }
      if (initial.serverOrigin) {
        this.serverUrl = initial.serverOrigin;
      }
    } catch {
      // defaults
    }
  }

  private t(key: string, params?: Record<string, string>): string {
    return this.translator ? this.translator.t(key, params) : key;
  }

  private async handleConnect(): Promise<void> {
    if (this.loading) return;

    const rawUrl = this.serverUrl.trim();
    if (!rawUrl) {
      this.error = this.t('server.errorInvalid');
      return;
    }

    this.loading = true;
    this.error = '';

    try {
      if (!this.adapter) throw new Error('NO_ADAPTER');
      const res = await this.adapter.saveServer(rawUrl);
      this.loading = false;
      this.dispatchEvent(
        new CustomEvent('k-done', {
          bubbles: true,
          composed: true,
          detail: { origin: res.origin },
        }),
      );
    } catch (err: unknown) {
      this.loading = false;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('INSECURE')) {
        this.error = this.t('server.errorInsecure');
      } else if (
        errMsg.includes('INVALID_URL') ||
        errMsg.includes('INVALID_RESPONSE')
      ) {
        this.error = this.t('server.errorInvalid');
      } else {
        this.error = this.t('server.errorUnreachable');
      }
    }
  }

  override render() {
    return html`
      <k-dialog-layout .heading="${this.t('server.title')}">
        <p class="subtitle">${this.t('server.subtitle')}</p>
        <k-input
          .value="${this.serverUrl}"
          .placeholder="${this.t('server.placeholder')}"
          .error="${this.error}"
          ?disabled="${this.loading}"
          type="url"
          @k-input="${(e: CustomEvent<{ value: string }>) => {
            this.serverUrl = e.detail.value;
            this.error = '';
          }}"
          @k-enter="${() => void this.handleConnect()}"></k-input>

        <k-dialog-actions
          slot="actions"
          align="end">
          <k-button
            variant="primary"
            ?loading="${this.loading}"
            ?disabled="${this.loading}"
            @k-click="${() => void this.handleConnect()}">
            ${
              this.loading
                ? this.t('server.connecting')
                : this.t('server.connect')
            }
          </k-button>
        </k-dialog-actions>
      </k-dialog-layout>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-server-dialog': KServerDialog;
  }
}
