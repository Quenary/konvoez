import { LitElement, css, html } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { tokens } from '../theme/tokens';

let nextInputId = 0;

@customElement('k-input')
export class KInput extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
      }
      .label-wrapper {
        display: block;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--tui-text-secondary);
        margin-bottom: 0.375rem;
      }
      .input-wrapper {
        display: flex;
        align-items: center;
        background-color: var(--tui-background-neutral-1);
        border: 1px solid var(--tui-border-normal);
        border-radius: var(--tui-radius-m, 0.75rem);
        height: var(--tui-height-m, 2.75rem);
        padding: 0 0.875rem;
        transition:
          border-color 0.15s ease,
          box-shadow 0.15s ease;
        box-sizing: border-box;
      }
      .input-wrapper:focus-within {
        border-color: var(--tui-border-focus);
      }
      :host([error]:not([error=''])) .input-wrapper {
        border-color: var(--tui-text-negative);
      }
      input {
        flex: 1;
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        font-family: inherit;
        font-size: 0.9375rem;
        color: var(--tui-text-primary);
        line-height: 1;
        padding: 0;
      }
      input::placeholder {
        color: var(--tui-text-tertiary);
      }
      input:disabled {
        cursor: not-allowed;
        color: var(--tui-text-tertiary);
      }
      .suffix {
        display: inline-flex;
        align-items: center;
        margin-left: 0.5rem;
      }
      .hint {
        font-size: 0.75rem;
        color: var(--tui-text-tertiary);
        margin-top: 0.375rem;
        line-height: 1.35;
      }
      .error {
        font-size: 0.75rem;
        color: var(--tui-text-negative);
        margin-top: 0.375rem;
        line-height: 1.35;
      }
    `,
  ];

  private readonly idSuffix = ++nextInputId;
  readonly inputId = `k-input-${this.idSuffix}`;
  readonly hintId = `k-input-${this.idSuffix}-hint`;
  readonly errorId = `k-input-${this.idSuffix}-error`;

  @query('input') accessor inputEl?: HTMLInputElement;

  @property() accessor value = '';
  @property() accessor label = '';
  @property() accessor hint = '';
  @property({ reflect: true }) accessor error = '';
  @property() accessor placeholder = '';
  @property({ type: Boolean, reflect: true }) accessor disabled = false;
  @property({ type: Boolean, reflect: true }) accessor readonly = false;
  @property() accessor type: 'text' | 'url' = 'text';
  @property({ type: Boolean }) accessor autofocus = false;

  private handleInput(e: Event): void {
    const target = e.target as HTMLInputElement;
    this.value = target.value;
    this.dispatchEvent(
      new CustomEvent('k-input', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      }),
    );
  }

  private handleBlur(): void {
    this.dispatchEvent(
      new CustomEvent('k-change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      }),
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      this.dispatchEvent(
        new CustomEvent('k-enter', {
          bubbles: true,
          composed: true,
          detail: { value: this.value },
        }),
      );
      this.dispatchEvent(
        new CustomEvent('k-change', {
          bubbles: true,
          composed: true,
          detail: { value: this.value },
        }),
      );
    }
  }

  override focus(): void {
    this.inputEl?.focus();
  }

  override blur(): void {
    this.inputEl?.blur();
  }

  override render() {
    const describedIds: string[] = [];
    if (this.error) describedIds.push(this.errorId);
    if (this.hint) describedIds.push(this.hintId);
    const describedBy = describedIds.join(' ') || undefined;

    return html`
      ${
        this.label
          ? html`
              <label
                class="label-wrapper"
                for="${this.inputId}">
                ${this.label}
              </label>
            `
          : ''
      }
      <div class="input-wrapper">
        <input
          id="${this.inputId}"
          part="input"
          type="${this.type}"
          .value="${this.value}"
          placeholder="${this.placeholder}"
          ?disabled="${this.disabled}"
          ?readonly="${this.readonly}"
          ?autofocus="${this.autofocus}"
          aria-invalid="${this.error ? 'true' : 'false'}"
          aria-describedby="${describedBy}"
          @input="${this.handleInput}"
          @blur="${this.handleBlur}"
          @keydown="${this.handleKeyDown}" />
        <div class="suffix">
          <slot name="suffix"></slot>
        </div>
      </div>
      ${
        this.error
          ? html`
              <div
                id="${this.errorId}"
                class="error"
                part="error"
                role="alert">
                ${this.error}
              </div>
            `
          : ''
      }
      ${
        this.hint && !this.error
          ? html`
              <div
                id="${this.hintId}"
                class="hint"
                part="hint">
                ${this.hint}
              </div>
            `
          : ''
      }
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-input': KInput;
  }
}
