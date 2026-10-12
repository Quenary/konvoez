import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

export interface ITabItem {
  id: string;
  label: string;
}

@customElement('k-tabs')
export class KTabs extends LitElement {
  static override styles = css`
    :host {
      display: block;
    }
    .tablist {
      display: flex;
      gap: 0.25rem;
      background-color: var(--tui-background-neutral-1);
      padding: 0.25rem;
      border-radius: var(--tui-radius-m, 0.75rem);
      box-sizing: border-box;
    }
    button {
      flex: 1;
      border: none;
      background: transparent;
      padding: 0.5rem 1rem;
      border-radius: var(--tui-radius-s, 0.5rem);
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--tui-text-secondary);
      cursor: pointer;
      transition:
        background-color 0.15s ease,
        color 0.15s ease,
        box-shadow 0.15s ease;
      outline: none;
      text-align: center;
      user-select: none;
    }
    button:hover:not(.active) {
      color: var(--tui-text-primary);
      background-color: var(--tui-background-neutral-1-hover);
    }
    button.active {
      background-color: var(--tui-background-base, #ffffff);
      color: var(--tui-text-action);
      font-weight: 600;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    button:focus-visible {
      outline: 2px solid var(--tui-border-focus);
      outline-offset: 1px;
    }
  `;

  @property({ type: Array }) accessor tabs: ITabItem[] = [];
  @property({ reflect: true }) accessor value = '';

  private selectTab(id: string): void {
    if (this.value === id) return;
    this.value = id;
    this.dispatchEvent(
      new CustomEvent('k-change', {
        bubbles: true,
        composed: true,
        detail: { value: id },
      }),
    );
  }

  private handleKeyDown(e: KeyboardEvent, index: number): void {
    if (this.tabs.length === 0) return;
    let nextIndex = index;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % this.tabs.length;
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + this.tabs.length) % this.tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = this.tabs.length - 1;
    } else {
      return;
    }

    const nextTab = this.tabs[nextIndex];
    if (nextTab) {
      this.selectTab(nextTab.id);
      this.updateComplete.then(() => {
        const buttons =
          this.renderRoot.querySelectorAll<HTMLButtonElement>('button');
        buttons[nextIndex]?.focus();
      });
    }
  }

  override render() {
    return html`
      <div
        class="tablist"
        role="tablist">
        ${this.tabs.map((tab, index) => {
          const isActive = this.value === tab.id;
          return html`
            <button
              id="tab-${tab.id}"
              role="tab"
              type="button"
              class="${isActive ? 'active' : ''}"
              part="tab${isActive ? ' tab-active' : ''}"
              aria-selected="${isActive ? 'true' : 'false'}"
              tabindex="${isActive ? 0 : -1}"
              @click="${() => this.selectTab(tab.id)}"
              @keydown="${(e: KeyboardEvent) => this.handleKeyDown(e, index)}">
              ${tab.label}
            </button>
          `;
        })}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-tabs': KTabs;
  }
}
