import { describe, expect, it } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-message';
import type { KMessage } from './k-message';

describe('k-message', () => {
  it('renders nothing when text is empty', async () => {
    const el = await fixture<KMessage>(html` <k-message></k-message> `);

    const message = el.shadowRoot?.querySelector('.message');
    expect(message).toBeNull();
  });

  it('sets role="status" for info and success', async () => {
    const infoEl = await fixture<KMessage>(html`
      <k-message
        variant="info"
        text="Information text"></k-message>
    `);
    const infoMsg = infoEl.shadowRoot?.querySelector('.message');
    expect(infoMsg?.getAttribute('role')).toBe('status');
    expect(infoMsg?.textContent).toContain('Information text');

    const successEl = await fixture<KMessage>(html`
      <k-message
        variant="success"
        text="Success text"></k-message>
    `);
    const successMsg = successEl.shadowRoot?.querySelector('.message');
    expect(successMsg?.getAttribute('role')).toBe('status');
    expect(successMsg?.textContent).toContain('Success text');
  });

  it('sets role="alert" for error', async () => {
    const errorEl = await fixture<KMessage>(html`
      <k-message
        variant="error"
        text="An error occurred"></k-message>
    `);
    const errorMsg = errorEl.shadowRoot?.querySelector('.message');
    expect(errorMsg?.getAttribute('role')).toBe('alert');
    expect(errorMsg?.textContent).toContain('An error occurred');
  });
});
