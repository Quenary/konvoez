import { describe, expect, it, afterEach } from 'vitest';
import { html } from 'lit';
import { fixture, cleanupFixtures } from '../testing/fixture';
import './k-spinner';
import type { KSpinner } from './k-spinner';

describe('k-spinner', () => {
  afterEach(() => {
    cleanupFixtures();
  });

  it('renders with default size m and aria-hidden when label is empty', async () => {
    const el = await fixture<KSpinner>(html`<k-spinner></k-spinner>`);
    expect(el.size).toBe('m');
    const svg = el.shadowRoot?.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute('part')).toBe('svg');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('sets role and aria-label when label is provided', async () => {
    const el = await fixture<KSpinner>(
      html`<k-spinner label="Loading data"></k-spinner>`,
    );
    const svg = el.shadowRoot?.querySelector('svg');
    expect(svg?.getAttribute('role')).toBe('progressbar');
    expect(svg?.getAttribute('aria-label')).toBe('Loading data');
  });

  it('reflects size attribute', async () => {
    const el = await fixture<KSpinner>(html`<k-spinner size="s"></k-spinner>`);
    expect(el.getAttribute('size')).toBe('s');
  });
});
