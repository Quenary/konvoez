import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { tokens } from '../theme/tokens';

let nextCheckboxId = 0;

@customElement('k-checkbox')
export class KCheckbox extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
      }
      .checkbox-container {
        display: inline-flex;
        align-items: flex-start;
        gap: 0.75rem;
        cursor: pointer;
        user-select: none;
        position: relative;
      }
      :host([disabled]) .checkbox-container {
        cursor: not-allowed;
        opacity: 0.6;
      }
      .box-wrapper {
        position: relative;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        margin-top: 0.125rem;
      }
      input {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
        margin: 0;
      }
      .box {
        width: 1.25rem;
        height: 1.25rem;
        border-radius: var(--tui-radius-s, 0.375rem);
        border: 2px solid var(--tui-border-normal);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background-color: var(--tui-background-neutral-1);
        transition:
          background-color 0.15s ease,
          border-color 0.15s ease,
          color 0.15s ease;
        box-sizing: border-box;
      }
      input:focus-visible + .box {
        border-color: var(--tui-border-focus);
      }
      input:checked + .box {
        background-color: var(--tui-background-accent-1);
        border-color: var(--tui-background-accent-1);
        color: var(--tui-text-primary-on-accent-1);
      }
      .checkmark {
        display: none;
        width: 0.875rem;
        height: 0.875rem;
      }
      input:checked + .box .checkmark {
        display: block;
      }
      .content {
        display: flex;
        flex-direction: column;
      }
      .label {
        font-size: 0.9375rem;
        color: var(--tui-text-primary);
        line-height: 1.4;
      }
      .hint {
        font-size: 0.75rem;
        color: var(--tui-text-tertiary);
        margin-top: 0.125rem;
        line-height: 1.35;
      }
    `,
  ];

  private readonly idSuffix = ++nextCheckboxId;
  readonly hintId = `k-checkbox-${this.idSuffix}-hint`;

  @property({ type: Boolean, reflect: true }) accessor checked = false;
  @property() accessor label = '';
  @property() accessor hint = '';
  @property({ type: Boolean, reflect: true }) accessor disabled = false;

  private handleChange(e: Event): void {
    if (this.disabled) {
      e.preventDefault();
      return;
    }
    const target = e.target as HTMLInputElement;
    this.checked = target.checked;
    this.dispatchEvent(
      new CustomEvent('k-change', {
        bubbles: true,
        composed: true,
        detail: { checked: this.checked },
      }),
    );
  }

  override render() {
    return html`
      <label class="checkbox-container">
        <span class="box-wrapper">
          <input
            type="checkbox"
            .checked="${this.checked}"
            ?disabled="${this.disabled}"
            aria-describedby="${this.hint ? this.hintId : undefined}"
            @change="${this.handleChange}" />
          <span
            class="box"
            part="box">
            <svg
              class="checkmark"
              viewBox="0 0 16 16">
              <path
                d="M3.5 8.5L6.5 11.5L12.5 4.5"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none" />
            </svg>
          </span>
        </span>
        <span class="content">
          <span
            class="label"
            part="label">
            ${this.label}
            <slot></slot>
          </span>
          ${
            this.hint
              ? html`
                  <span
                    id="${this.hintId}"
                    class="hint"
                    part="hint">
                    ${this.hint}
                  </span>
                `
              : ''
          }
        </span>
      </label>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-checkbox': KCheckbox;
  }
}
