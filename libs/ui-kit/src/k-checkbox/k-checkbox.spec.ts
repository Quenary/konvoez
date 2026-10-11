import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-checkbox';
import type { KCheckbox } from './k-checkbox';

describe('k-checkbox', () => {
  it('renders label and hint linked by aria-describedby', async () => {
    const el = await fixture<KCheckbox>(html`
      <k-checkbox
        label="Launch at startup"
        hint="Automatically start when system boots"></k-checkbox>
    `);

    const label = el.shadowRoot?.querySelector('.label');
    expect(label?.textContent).toContain('Launch at startup');

    const input = el.shadowRoot?.querySelector('input');
    expect(input?.getAttribute('aria-describedby')).toBe(el.hintId);

    const hint = el.shadowRoot?.querySelector('.hint');
    expect(hint?.id).toBe(el.hintId);
    expect(hint?.textContent?.trim()).toBe(
      'Automatically start when system boots',
    );
  });

  it('clicking the label toggles it and emits k-change {checked}', async () => {
    const el = await fixture<KCheckbox>(html`
      <k-checkbox label="Audio"></k-checkbox>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const input = el.shadowRoot?.querySelector('input');
    if (!input) throw new Error('Input not found');

    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].detail).toEqual({ checked: true });
    expect(el.checked).toBe(true);

    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await el.updateComplete;

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[1][0].detail).toEqual({ checked: false });
    expect(el.checked).toBe(false);
  });

  it('disabled suppresses toggle', async () => {
    const el = await fixture<KCheckbox>(html`
      <k-checkbox
        label="Disabled option"
        disabled></k-checkbox>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const input = el.shadowRoot?.querySelector('input');
    expect(input?.hasAttribute('disabled')).toBe(true);

    input?.dispatchEvent(new Event('change', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
