import { describe, expect, it } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-dialog-actions';
import type { KDialogActions } from './k-dialog-actions';

describe('k-dialog-actions', () => {
  it('renders actions container with align attribute reflected', async () => {
    const el = await fixture<KDialogActions>(html`
      <k-dialog-actions align="between">
        <button>Cancel</button>
        <button>Confirm</button>
      </k-dialog-actions>
    `);

    expect(el.getAttribute('align')).toBe('between');
    const container = el.shadowRoot?.querySelector('.actions');
    expect(container).not.toBeNull();
  });
});
