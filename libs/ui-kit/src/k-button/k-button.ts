import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { tokens } from '../theme/tokens';
import '../k-spinner/k-spinner';

@customElement('k-button')
export class KButton extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: inline-block;
        box-sizing: border-box;
      }
      button {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        height: var(--tui-height-m, 2.75rem);
        padding: 0 1.25rem;
        border-radius: var(--tui-radius-m, 0.75rem);
        font-family: inherit;
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid transparent;
        outline: none;
        transition:
          background-color 0.15s ease,
          opacity 0.15s ease,
          border-color 0.15s ease;
        box-sizing: border-box;
        width: 100%;
        line-height: 1;
      }
      :host([disabled]) button,
      :host([loading]) button {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .content {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }
      .content.loading {
        visibility: hidden;
      }
      .spinner-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      :host([variant='primary']) button {
        background-color: var(--tui-background-accent-1);
        color: var(--tui-text-primary-on-accent-1);
      }
      :host([variant='primary']:not([disabled]):not([loading])) button:hover {
        background-color: var(--tui-background-accent-1-hover);
      }
      :host([variant='secondary']) button {
        background-color: var(--tui-background-neutral-1);
        color: var(--tui-text-primary);
      }
      :host([variant='secondary']:not([disabled]):not([loading])) button:hover {
        background-color: var(--tui-background-neutral-1-hover);
      }
      :host([variant='danger']) button {
        background-color: var(--tui-status-negative);
        color: #ffffff;
      }
      :host([variant='danger']:not([disabled]):not([loading])) button:hover {
        opacity: 0.9;
      }
      button:focus-visible {
        border-color: var(--tui-border-focus);
      }
    `,
  ];

  @property({ reflect: true }) accessor variant:
    'primary' | 'secondary' | 'danger' = 'primary';
  @property({ type: Boolean, reflect: true }) accessor disabled = false;
  @property({ type: Boolean, reflect: true }) accessor loading = false;
  @property() accessor type: 'button' | 'submit' = 'button';

  private handleClick(e: MouseEvent): void {
    if (this.disabled || this.loading) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    this.dispatchEvent(
      new CustomEvent('k-click', {
        bubbles: true,
        composed: true,
        detail: {},
      }),
    );
  }

  override render() {
    return html`
      <button
        part="button"
        type="${this.type}"
        ?disabled="${this.disabled || this.loading}"
        aria-disabled="${this.disabled || this.loading ? 'true' : 'false'}"
        aria-busy="${this.loading ? 'true' : 'false'}"
        @click="${this.handleClick}">
        <span class="content ${this.loading ? 'loading' : ''}">
          <slot name="icon-start"></slot>
          <slot></slot>
        </span>
        ${
          this.loading
            ? html`<span class="spinner-overlay"
                ><k-spinner size="s"></k-spinner
              ></span>`
            : ''
        }
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-button': KButton;
  }
}
