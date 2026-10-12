import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { ISerializableSource } from '@konvoez/client-shell';
import '../k-source-card/k-source-card';
import type { KSourceCard } from '../k-source-card/k-source-card';

@customElement('k-source-grid')
export class KSourceGrid extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
      gap: 0.75rem;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      overflow-y: auto;
      padding: 0.25rem;
      box-sizing: border-box;
    }
    .empty {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 1 1 auto;
      min-height: 10rem;
      color: var(--tui-text-tertiary);
      font-size: 0.875rem;
      text-align: center;
    }
  `;

  @property({ type: Array }) accessor sources: ISerializableSource[] = [];
  @property({ reflect: true }) accessor value: string | null = null;

  private handleCardSelect(e: CustomEvent<{ sourceId: string }>): void {
    e.stopPropagation();
    this.value = e.detail.sourceId;
    this.dispatchEvent(
      new CustomEvent('k-select', {
        bubbles: true,
        composed: true,
        detail: e.detail,
      }),
    );
  }

  private handleCardActivate(e: CustomEvent<{ sourceId: string }>): void {
    e.stopPropagation();
    this.value = e.detail.sourceId;
    this.dispatchEvent(
      new CustomEvent('k-activate', {
        bubbles: true,
        composed: true,
        detail: e.detail,
      }),
    );
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.sources.length === 0) return;
    const currentIndex = this.sources.findIndex((s) => s.id === this.value);
    const validCurrent = currentIndex >= 0 ? currentIndex : 0;
    let nextIndex = validCurrent;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (validCurrent + 1) % this.sources.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex =
        (validCurrent - 1 + this.sources.length) % this.sources.length;
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = Math.min(validCurrent + 2, this.sources.length - 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = Math.max(validCurrent - 2, 0);
    } else {
      return;
    }

    const nextSource = this.sources[nextIndex];
    if (nextSource) {
      this.value = nextSource.id;
      this.dispatchEvent(
        new CustomEvent('k-select', {
          bubbles: true,
          composed: true,
          detail: { sourceId: nextSource.id },
        }),
      );
      this.updateComplete.then(() => {
        const cards =
          this.renderRoot.querySelectorAll<KSourceCard>('k-source-card');
        cards[nextIndex]?.focus();
      });
    }
  }

  override render() {
    if (this.sources.length === 0) {
      return html`
        <div class="empty">
          <slot name="empty"></slot>
        </div>
      `;
    }

    return html`
      <div
        class="grid"
        part="grid"
        role="listbox"
        @keydown="${this.handleKeyDown}">
        ${this.sources.map((source, index) => {
          const isSelected = this.value === source.id;
          const isDefaultFocused = !this.value && index === 0;
          return html`
            <k-source-card
              .sourceId="${source.id}"
              .name="${source.name}"
              .thumbnailUrl="${source.thumbnailUrl}"
              .appIconUrl="${source.appIconUrl}"
              ?selected="${isSelected}"
              tabindex="${isSelected || isDefaultFocused ? '0' : '-1'}"
              @k-select="${this.handleCardSelect}"
              @k-activate="${this.handleCardActivate}"></k-source-card>
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-source-grid': KSourceGrid;
  }
}
