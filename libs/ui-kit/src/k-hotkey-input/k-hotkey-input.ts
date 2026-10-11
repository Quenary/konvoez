import { LitElement, css, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { formatKeyboardEventToAccelerator } from '@konvoez/client-shell';
import { tokens } from '../theme/tokens';
import '../k-input/k-input';
import type { KInput } from '../k-input/k-input';

@customElement('k-hotkey-input')
export class KHotkeyInput extends LitElement {
  static override styles = [
    tokens,
    css`
      :host {
        display: block;
        outline: none;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ];

  @property() accessor value: string | null = null;
  @property() accessor label = '';
  @property() accessor hint = '';
  @property() accessor error = '';
  @property() accessor recordingPlaceholder = '';
  @property() accessor clearHint = '';
  @property({ type: Boolean, reflect: true }) accessor disabled = false;

  @state() accessor recording = false;
  private initialValueBeforeRecording: string | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('focus', this.handleFocus);
    this.addEventListener('focusin', this.handleFocus);
    this.addEventListener('blur', this.handleBlur);
    this.addEventListener('focusout', this.handleBlur);
    this.addEventListener('click', this.handleClick);
    this.addEventListener('keydown', this.handleKeyDown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener('focus', this.handleFocus);
    this.removeEventListener('focusin', this.handleFocus);
    this.removeEventListener('blur', this.handleBlur);
    this.removeEventListener('focusout', this.handleBlur);
    this.removeEventListener('click', this.handleClick);
    this.removeEventListener('keydown', this.handleKeyDown);
  }

  private startRecording(): void {
    if (this.disabled || this.recording) return;
    this.recording = true;
    this.initialValueBeforeRecording = this.value;
    this.dispatchEvent(
      new CustomEvent('k-recording-start', {
        bubbles: true,
        composed: true,
      }),
    );
  }

  private handleFocus = (): void => {
    this.startRecording();
  };

  private handleClick = (): void => {
    this.startRecording();
  };

  private handleBlur = (e: FocusEvent): void => {
    // If focus moved to another child within host, do not cancel
    if (e.relatedTarget && this.contains(e.relatedTarget as Node)) {
      return;
    }
    if (!this.recording) return;
    this.recording = false;
    this.value = this.initialValueBeforeRecording;
    this.dispatchEvent(
      new CustomEvent('k-recording-stop', {
        bubbles: true,
        composed: true,
        detail: { cancelled: true },
      }),
    );
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.recording) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape' || e.code === 'Escape') {
      this.recording = false;
      this.value = this.initialValueBeforeRecording;
      this.dispatchEvent(
        new CustomEvent('k-recording-stop', {
          bubbles: true,
          composed: true,
          detail: { cancelled: true },
        }),
      );
      return;
    }

    if (e.key === 'Backspace' || e.code === 'Backspace') {
      this.recording = false;
      this.value = null;
      this.dispatchEvent(
        new CustomEvent('k-change', {
          bubbles: true,
          composed: true,
          detail: { value: null },
        }),
      );
      this.dispatchEvent(
        new CustomEvent('k-recording-stop', {
          bubbles: true,
          composed: true,
          detail: { cancelled: false },
        }),
      );
      return;
    }

    const accelerator = formatKeyboardEventToAccelerator(e);
    if (accelerator !== null) {
      this.recording = false;
      this.value = accelerator;
      this.dispatchEvent(
        new CustomEvent('k-change', {
          bubbles: true,
          composed: true,
          detail: { value: accelerator },
        }),
      );
      this.dispatchEvent(
        new CustomEvent('k-recording-stop', {
          bubbles: true,
          composed: true,
          detail: { cancelled: false },
        }),
      );
    }
  };

  override focus(): void {
    const input = this.renderRoot.querySelector<KInput>('k-input');
    input?.focus();
  }

  override render() {
    const displayValue = this.recording ? '' : (this.value ?? '');
    const activeHint =
      this.recording && this.clearHint ? this.clearHint : this.hint;

    return html`
      <k-input
        exportparts="input"
        .label="${this.label}"
        .hint="${activeHint}"
        .error="${this.error}"
        .value="${displayValue}"
        .placeholder="${this.recording ? this.recordingPlaceholder : ''}"
        ?disabled="${this.disabled}"
        readonly>
      </k-input>
      <div
        class="sr-only"
        aria-live="polite"
        role="status">
        ${
          this.recording
            ? this.recordingPlaceholder || 'Recording shortcut'
            : ''
        }
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-hotkey-input': KHotkeyInput;
  }
}
