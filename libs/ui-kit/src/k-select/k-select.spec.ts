import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-select';
import type { KSelect } from './k-select';

describe('k-select', () => {
  it('renders the label for the native select', async () => {
    const el = await fixture<KSelect>(html`
      <k-select
        label="Audio source"
        .options="${[
          { value: '', label: 'All' },
          { value: 'node-1', label: 'Spotify' },
        ]}"></k-select>
    `);

    const label = el.shadowRoot?.querySelector('label');
    const select = el.shadowRoot?.querySelector('select');
    expect(label?.getAttribute('for')).toBe(select?.id);
    expect(select?.id).toBe(el.selectId);
    expect(select?.options).toHaveLength(2);
    expect(select?.options[1]?.textContent?.trim()).toBe('Spotify');
  });

  it('emits k-change with the selected value', async () => {
    const el = await fixture<KSelect>(html`
      <k-select
        value=""
        .options="${[
          { value: '', label: 'All' },
          { value: 'node-1', label: 'Spotify' },
        ]}"></k-select>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const select = el.shadowRoot?.querySelector('select');
    if (!select) throw new Error('Select not found');
    select.value = 'node-1';
    select.dispatchEvent(new Event('change'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].detail).toEqual({ value: 'node-1' });
    expect(el.value).toBe('node-1');
  });
});
