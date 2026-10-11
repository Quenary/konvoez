import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-source-card';
import type { KSourceCard } from './k-source-card';

describe('k-source-card', () => {
  it('renders with option role and reflects selected attribute', async () => {
    const el = await fixture<KSourceCard>(html`
      <k-source-card
        sourceId="screen:0:0"
        name="Entire Screen"
        thumbnailUrl="data:image/png;base64,abc"
        selected></k-source-card>
    `);

    expect(el.getAttribute('role')).toBe('option');
    expect(el.getAttribute('aria-selected')).toBe('true');
    expect(el.selected).toBe(true);
  });

  it('click and Space emit k-select', async () => {
    const el = await fixture<KSourceCard>(html`
      <k-source-card
        sourceId="window:123"
        name="Browser Window"
        thumbnailUrl="data:image/png;base64,abc"></k-source-card>
    `);

    const onSelect = vi.fn();
    el.addEventListener('k-select', onSelect);

    el.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].detail).toEqual({
      sourceId: 'window:123',
    });

    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }),
    );
    expect(onSelect).toHaveBeenCalledTimes(2);
    expect(onSelect.mock.calls[1][0].detail).toEqual({
      sourceId: 'window:123',
    });
  });

  it('dblclick and Enter emit k-activate', async () => {
    const el = await fixture<KSourceCard>(html`
      <k-source-card
        sourceId="window:123"
        name="Browser Window"
        thumbnailUrl="data:image/png;base64,abc"></k-source-card>
    `);

    const onActivate = vi.fn();
    el.addEventListener('k-activate', onActivate);

    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].detail).toEqual({
      sourceId: 'window:123',
    });

    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(onActivate).toHaveBeenCalledTimes(2);
    expect(onActivate.mock.calls[1][0].detail).toEqual({
      sourceId: 'window:123',
    });
  });
});
