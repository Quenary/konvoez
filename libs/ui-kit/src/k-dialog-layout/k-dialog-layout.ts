import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('k-dialog-layout')
export class KDialogLayout extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100%;
      min-height: 100%;
      padding: 1.5rem;
      background-color: var(--tui-background-base);
      color: var(--tui-text-primary);
    }
    header {
      margin-bottom: 1.25rem;
    }
    h1 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 700;
      line-height: 1.3;
      color: var(--tui-text-primary);
    }
    main {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    footer {
      flex-shrink: 0;
      margin-top: auto;
      padding-top: 1.5rem;
    }
  `;

  @property() accessor heading = '';

  override render() {
    return html`
      ${
        this.heading
          ? html`
              <header part="header">
                <h1>${this.heading}</h1>
              </header>
            `
          : ''
      }
      <main
        part="body"
        role="main">
        <slot></slot>
      </main>
      <footer part="actions">
        <slot name="actions"></slot>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'k-dialog-layout': KDialogLayout;
  }
}
