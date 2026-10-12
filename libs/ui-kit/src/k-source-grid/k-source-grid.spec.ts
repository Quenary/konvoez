import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-source-grid';
import type { KSourceGrid } from './k-source-grid';

describe('k-source-grid', () => {
  const sources = [
    {
      id: 'screen:0',
      name: 'Screen 1',
      thumbnailUrl: 'data:image/png;base64,aaa',
      appIconUrl: null,
    },
    {
      id: 'window:1',
      name: 'Terminal',
      thumbnailUrl: 'data:image/png;base64,bbb',
      appIconUrl: null,
    },
  ];

  it('renders empty slot when sources is empty', async () => {
    const el = await fixture<KSourceGrid>(html`
      <k-source-grid .sources="${[]}">
        <div slot="empty">No sources available</div>
      </k-source-grid>
    `);

    const empty = el.shadowRoot?.querySelector('.empty');
    expect(empty).not.toBeNull();
    expect(el.textContent).toContain('No sources available');
  });

  it('renders cards and redispatches k-select', async () => {
    const el = await fixture<KSourceGrid>(html`
      <k-source-grid .sources="${sources}"></k-source-grid>
    `);

    const onSelect = vi.fn();
    el.addEventListener('k-select', onSelect);

    const cards = el.shadowRoot?.querySelectorAll('k-source-card');
    expect(cards).toHaveLength(2);

    cards?.[1].dispatchEvent(
      new CustomEvent('k-select', {
        bubbles: true,
        composed: true,
        detail: { sourceId: 'window:1' },
      }),
    );
    await el.updateComplete;

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].detail).toEqual({ sourceId: 'window:1' });
    expect(el.value).toBe('window:1');
  });

  it('redispatches k-activate', async () => {
    const el = await fixture<KSourceGrid>(html`
      <k-source-grid .sources="${sources}"></k-source-grid>
    `);

    const onActivate = vi.fn();
    el.addEventListener('k-activate', onActivate);

    const cards = el.shadowRoot?.querySelectorAll('k-source-card');
    cards?.[0].dispatchEvent(
      new CustomEvent('k-activate', {
        bubbles: true,
        composed: true,
        detail: { sourceId: 'screen:0' },
      }),
    );

    expect(onActivate).toHaveBeenCalledTimes(1);
    expect(onActivate.mock.calls[0][0].detail).toEqual({
      sourceId: 'screen:0',
    });
  });
});
