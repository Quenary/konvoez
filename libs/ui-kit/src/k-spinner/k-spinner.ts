import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
@customElement('k-spinner')
export class KSpinner extends LitElement {
  static override styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--k-spinner-color, currentColor);
      vertical-align: middle;
    }
    :host([size='s']) svg {
      width: 1rem;
      height: 1rem;
    }
    :host([size='m']) svg {
      width: 1.5rem;
      height: 1.5rem;
    }
    svg {
      animation: k-spinner-rotate 0.8s linear infinite;
    }
    circle {
      stroke: currentColor;
      stroke-linecap: round;
      stroke-dasharray: 40;
      stroke-dashoffset: 20;
    }
    @keyframes k-spinner-rotate {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `;

  @property({ reflect: true }) accessor size: 's' | 'm' = 'm';
  @property() accessor label = '';

  override render() {
    const isAccessible = Boolean(this.label);
    return html`
      <svg
        part="svg"
        viewBox="0 0 24 24"
        fill="none"
        role="${isAccessible ? 'progressbar' : 'presentation'}"
        aria-label="${isAccessible ? this.label : undefined}"
        aria-hidden="${isAccessible ? undefined : 'true'}">
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke-width="2.5" />
      </svg>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-spinner': KSpinner;
  }
}
