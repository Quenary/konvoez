import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface KSelectOption {
  value: string;
  label: string;
}

let nextSelectId = 0;

@customElement('k-select')
export class KSelect extends LitElement {
  static override styles = css`
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
    .field {
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
    .field:focus-within {
      border-color: var(--tui-border-focus);
    }
    select {
      flex: 1;
      width: 100%;
      appearance: none;
      background: transparent;
      border: none;
      outline: none;
      font-family: inherit;
      font-size: 0.9375rem;
      color: var(--tui-text-primary);
      line-height: 1;
      padding: 0;
      cursor: pointer;
    }
    select:disabled {
      cursor: not-allowed;
      color: var(--tui-text-tertiary);
    }
    .chevron {
      flex: none;
      width: 0.45rem;
      height: 0.45rem;
      margin-left: 0.5rem;
      border-right: 1.5px solid var(--tui-text-secondary);
      border-bottom: 1.5px solid var(--tui-text-secondary);
      transform: rotate(45deg) translateY(-0.1rem);
      pointer-events: none;
    }
  `;

  private readonly idSuffix = ++nextSelectId;
  readonly selectId = `k-select-${this.idSuffix}`;

  @property() accessor value = '';
  @property() accessor label = '';
  @property({ attribute: false }) accessor options: readonly KSelectOption[] =
    [];
  @property({ type: Boolean, reflect: true }) accessor disabled = false;

  private handleChange(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    this.value = target.value;
    this.dispatchEvent(
      new CustomEvent('k-change', {
        bubbles: true,
        composed: true,
        detail: { value: this.value },
      }),
    );
  }

  override render() {
    return html`
      ${
        this.label
          ? html`
              <label
                class="label-wrapper"
                for="${this.selectId}">
                ${this.label}
              </label>
            `
          : ''
      }
      <div class="field">
        <select
          id="${this.selectId}"
          .value="${this.value}"
          ?disabled="${this.disabled}"
          @change="${this.handleChange}">
          ${this.options.map(
            (option) => html`
              <option
                value="${option.value}"
                ?selected="${option.value === this.value}">
                ${option.label}
              </option>
            `,
          )}
        </select>
        <span
          class="chevron"
          aria-hidden="true"></span>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-select': KSelect;
  }
}
