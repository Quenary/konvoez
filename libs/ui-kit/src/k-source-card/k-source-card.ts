import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { tokens } from '../theme/tokens';

@customElement('k-source-card')
export class KSourceCard extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: flex;
        flex-direction: column;
        cursor: pointer;
        border-radius: var(--tui-radius-m, 0.75rem);
        border: 2px solid var(--tui-border-normal);
        padding: 0.5rem;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
        background-color: var(--tui-background-neutral-1);
        outline: none;
        box-sizing: border-box;
        position: relative;
        user-select: none;
      }
      :host([selected]) {
        border-color: var(--tui-background-accent-1);
        box-shadow: 0 0 0 1px var(--tui-background-accent-1);
      }
      :host(:focus-visible) {
        outline: 2px solid var(--tui-border-focus);
        outline-offset: 2px;
      }
      .thumb-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16 / 9;
        background-color: #1a1a1a;
        border-radius: var(--tui-radius-s, 0.375rem);
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      img.thumb {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }
      img.app-icon {
        position: absolute;
        bottom: 0.375rem;
        left: 0.375rem;
        width: 1.25rem;
        height: 1.25rem;
        border-radius: 0.25rem;
        background: #ffffff;
        padding: 2px;
        box-sizing: border-box;
      }
      .name {
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--tui-text-primary);
        margin-top: 0.5rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-align: center;
        width: 100%;
      }
    `,
  ];

  @property() accessor sourceId = '';
  @property() accessor name = '';
  @property() accessor thumbnailUrl = '';
  @property() accessor appIconUrl: string | null = null;
  @property({ type: Boolean, reflect: true }) accessor selected = false;

  override connectedCallback(): void {
    super.connectedCallback();
    this.setAttribute('role', 'option');
    if (!this.hasAttribute('tabindex')) {
      this.setAttribute('tabindex', '0');
    }
    this.addEventListener('click', this.handleClick);
    this.addEventListener('dblclick', this.handleDblClick);
    this.addEventListener('keydown', this.handleKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('dblclick', this.handleDblClick);
    this.removeEventListener('keydown', this.handleKeyDown);
  }

  override updated(): void {
    this.setAttribute('aria-selected', this.selected ? 'true' : 'false');
  }

  private handleClick = (): void => {
    this.dispatchSelect();
  };

  private handleDblClick = (): void => {
    this.dispatchActivate();
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      this.dispatchSelect();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.dispatchActivate();
    }
  };

  private dispatchSelect(): void {
    this.dispatchEvent(
      new CustomEvent('k-select', {
        bubbles: true,
        composed: true,
        detail: { sourceId: this.sourceId },
      }),
    );
  }

  private dispatchActivate(): void {
    this.dispatchEvent(
      new CustomEvent('k-activate', {
        bubbles: true,
        composed: true,
        detail: { sourceId: this.sourceId },
      }),
    );
  }

  override render() {
    return html`
      <div
        class="thumb-wrapper"
        part="thumb">
        <img
          class="thumb"
          src="${this.thumbnailUrl}"
          alt="" />
        ${
          this.appIconUrl
            ? html`<img
                class="app-icon"
                src="${this.appIconUrl}"
                alt="" />`
            : ''
        }
      </div>
      <div
        class="name"
        part="name"
        title="${this.name}"
        >${this.name}</div
      >
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-source-card': KSourceCard;
  }
}
