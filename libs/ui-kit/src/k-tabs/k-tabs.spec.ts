import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-tabs';
import type { KTabs } from './k-tabs';

describe('k-tabs', () => {
  const tabs = [
    { id: 'screens', label: 'Screens' },
    { id: 'windows', label: 'Windows' },
  ];

  it('renders tabs with correct role and aria-selected', async () => {
    const el = await fixture<KTabs>(html`
      <k-tabs
        .tabs="${tabs}"
        value="screens"></k-tabs>
    `);

    const buttons = el.shadowRoot?.querySelectorAll('button');
    expect(buttons).toHaveLength(2);

    expect(buttons?.[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons?.[0].getAttribute('tabindex')).toBe('0');

    expect(buttons?.[1].getAttribute('aria-selected')).toBe('false');
    expect(buttons?.[1].getAttribute('tabindex')).toBe('-1');
  });

  it('clicking tab changes value and emits k-change', async () => {
    const el = await fixture<KTabs>(html`
      <k-tabs
        .tabs="${tabs}"
        value="screens"></k-tabs>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const buttons = el.shadowRoot?.querySelectorAll('button');
    buttons?.[1].click();
    await el.updateComplete;

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].detail).toEqual({ value: 'windows' });
    expect(el.value).toBe('windows');
    expect(buttons?.[1].getAttribute('aria-selected')).toBe('true');
  });

  it('arrow keys move focus and value', async () => {
    const el = await fixture<KTabs>(html`
      <k-tabs
        .tabs="${tabs}"
        value="screens"></k-tabs>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const buttons = el.shadowRoot?.querySelectorAll('button');
    const firstButton = buttons?.[0];
    if (!firstButton) throw new Error('First button not found');

    firstButton.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
    );
    await el.updateComplete;

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: { value: 'windows' },
      }),
    );
    expect(el.value).toBe('windows');
  });
});
