import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
@customElement('k-dialog-actions')
export class KDialogActions extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    :host([align='end']) .actions {
      justify-content: flex-end;
    }
    :host([align='between']) .actions {
      justify-content: space-between;
    }
  `;

  @property({ reflect: true }) accessor align: 'end' | 'between' = 'end';

  override render() {
    return html`
      <div
        class="actions"
        part="actions">
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-dialog-actions': KDialogActions;
  }
}
