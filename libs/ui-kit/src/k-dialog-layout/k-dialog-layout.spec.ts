import { describe, expect, it } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-dialog-layout';
import type { KDialogLayout } from './k-dialog-layout';

describe('k-dialog-layout', () => {
  it('renders heading in h1 and main landmark for content', async () => {
    const el = await fixture<KDialogLayout>(html`
      <k-dialog-layout heading="Server Settings">
        <p>Main content</p>
        <div slot="actions">
          <button>Save</button>
        </div>
      </k-dialog-layout>
    `);

    const h1 = el.shadowRoot?.querySelector('h1');
    expect(h1?.textContent).toBe('Server Settings');

    const main = el.shadowRoot?.querySelector('main');
    expect(main?.getAttribute('role')).toBe('main');

    const footer = el.shadowRoot?.querySelector('footer');
    expect(footer).not.toBeNull();
  });
});
