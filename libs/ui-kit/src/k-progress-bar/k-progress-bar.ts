import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Lit progress bar element visually aligned with Taiga UI progress bar.
 *
 * API:
 * - `value`: number strictly clamped to the range [0, 100]. Non-numbers or NaN clamp to 0.
 * - `indeterminate`: boolean. When true, renders an animated fill running across the track.
 * - `label`: optional label text centered over the bar. Slotted content takes precedence or is displayed.
 */
@customElement('k-progress-bar')
export class KProgressBar extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }
    .track {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: var(--k-progress-bar-height, 0.75rem);
      background-color: var(--tui-background-neutral-2);
      border-radius: 1rem;
      overflow: hidden;
    }
    .fill {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      background-color: var(--tui-background-accent-1);
      border-radius: inherit;
      transition: width 0.2s ease;
    }
    :host([indeterminate]) .fill {
      width: 35%;
      animation: k-progress-indeterminate 1.4s infinite
        cubic-bezier(0.65, 0.815, 0.735, 0.395);
      transition: none;
    }
    @keyframes k-progress-indeterminate {
      0% {
        left: -35%;
      }
      100% {
        left: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host([indeterminate]) .fill {
        animation: none;
        left: 0;
        width: 100%;
        opacity: 0.5;
      }
    }
    .label {
      position: relative;
      z-index: 1;
      font-size: 0.6875rem;
      font-weight: 600;
      line-height: 1;
      color: var(--tui-text-primary);
      pointer-events: none;
      user-select: none;
    }
  `;

  /**
   * Progress value strictly clamped to 0..100.
   */
  @property({ type: Number, reflect: true }) accessor value = 0;

  /**
   * Whether progress is indeterminate.
   */
  @property({ type: Boolean, reflect: true }) accessor indeterminate = false;

  /**
   * Optional centered label displayed over the bar.
   */
  @property() accessor label = '';

  override render() {
    const val = this.clampedValue;
    const isIndeterminate = this.indeterminate;

    return html`
      <div
        class="track"
        part="track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${isIndeterminate ? nothing : val}
        aria-label=${this.label || nothing}>
        <div
          class="fill"
          part="fill"
          style=${isIndeterminate ? '' : `width: ${val}%`}></div>
        <div
          class="label"
          part="label">
          <slot>${this.label}</slot>
        </div>
      </div>
    `;
  }

  private get clampedValue(): number {
    const num = Number(this.value);
    if (Number.isNaN(num) || num < 0) {
      return 0;
    }
    if (num > 100) {
      return 100;
    }
    return num;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-progress-bar': KProgressBar;
  }
}
