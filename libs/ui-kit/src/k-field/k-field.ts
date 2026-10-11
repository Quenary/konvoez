import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { tokens } from '../theme/tokens';

let nextFieldId = 0;

@customElement('k-field')
export class KField extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
      }
      .label-wrapper {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        font-size: 0.8125rem;
        font-weight: 500;
        color: var(--tui-text-secondary);
        margin-bottom: 0.375rem;
      }
      .required {
        color: var(--tui-text-negative);
      }
      .control-wrapper {
        position: relative;
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

  private readonly fieldId = `k-field-${++nextFieldId}`;
  readonly hintId = `${this.fieldId}-hint`;
  readonly errorId = `${this.fieldId}-error`;

  @property() accessor label = '';
  @property() accessor hint = '';
  @property() accessor error = '';
  @property({ type: Boolean, reflect: true }) accessor required = false;

  private syncSlottedDescribedBy(): void {
    const slot =
      this.renderRoot.querySelector<HTMLSlotElement>('slot:not([name])');
    if (!slot) return;
    const elements = slot
      .assignedElements({ flatten: true })
      .filter((el) => el instanceof HTMLElement) as HTMLElement[];

    const ids: string[] = [];
    if (this.error) ids.push(this.errorId);
    if (this.hint) ids.push(this.hintId);
    const describedBy = ids.join(' ');

    for (const el of elements) {
      if (describedBy) {
        el.setAttribute('aria-describedby', describedBy);
      } else {
        el.removeAttribute('aria-describedby');
      }
      if (this.required) {
        el.setAttribute('aria-required', 'true');
      }
    }
  }

  override updated(): void {
    this.syncSlottedDescribedBy();
  }

  private handleSlotChange(): void {
    this.syncSlottedDescribedBy();
  }

  override render() {
    return html`
      ${
        this.label
          ? html`
              <div
                class="label-wrapper"
                part="label">
                <span>${this.label}</span>
                ${
                  this.required
                    ? html`<span
                        class="required"
                        aria-hidden="true"
                        >*</span
                      >`
                    : ''
                }
                <slot name="label-suffix"></slot>
              </div>
            `
          : ''
      }
      <div class="control-wrapper">
        <slot @slotchange="${this.handleSlotChange}"></slot>
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
    'k-field': KField;
  }
}
