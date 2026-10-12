import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
@customElement('k-message')
export class KMessage extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .message {
      display: flex;
      align-items: flex-start;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      border-radius: var(--tui-radius-m, 0.75rem);
      font-size: 0.875rem;
      line-height: 1.4;
      box-sizing: border-box;
    }
    :host([variant='info']) .message {
      background-color: var(--tui-background-neutral-1);
      color: var(--tui-text-primary);
      border: 1px solid var(--tui-border-normal);
    }
    :host([variant='success']) .message {
      background-color: rgba(46, 174, 96, 0.12);
      color: var(--tui-text-positive, #2eae60);
      border: 1px solid rgba(46, 174, 96, 0.25);
    }
    :host([variant='error']) .message {
      background-color: rgba(235, 87, 87, 0.12);
      color: var(--tui-text-negative, #eb5757);
      border: 1px solid rgba(235, 87, 87, 0.25);
    }
  `;

  @property({ reflect: true }) accessor variant: 'info' | 'success' | 'error' =
    'info';
  @property() accessor text = '';

  override render() {
    if (!this.text) {
      return html``;
    }

    const role = this.variant === 'error' ? 'alert' : 'status';

    return html`
      <div
        class="message"
        part="message"
        role="${role}">
        <span>${this.text}</span>
        <slot></slot>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-message': KMessage;
  }
}
