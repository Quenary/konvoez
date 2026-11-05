import { describe, expect, it, afterEach } from 'vitest';
import { html } from 'lit';
import { fixture, cleanupFixtures } from '../testing/fixture';
import './k-progress-bar';
import type { KProgressBar } from './k-progress-bar';

describe('k-progress-bar', () => {
  afterEach(() => {
    cleanupFixtures();
  });

  it('clamps value between 0 and 100', async () => {
    const el = await fixture<KProgressBar>(
      html`<k-progress-bar .value="${-20}"></k-progress-bar>`,
    );
    const track = el.shadowRoot?.querySelector('[role="progressbar"]');
    const fill = el.shadowRoot?.querySelector('.fill') as HTMLElement;

    expect(track?.getAttribute('aria-valuenow')).toBe('0');
    expect(fill?.style.width).toBe('0%');

    el.value = 150;
    await el.updateComplete;
    expect(track?.getAttribute('aria-valuenow')).toBe('100');
    expect(fill?.style.width).toBe('100%');

    el.value = 45;
    await el.updateComplete;
    expect(track?.getAttribute('aria-valuenow')).toBe('45');
    expect(fill?.style.width).toBe('45%');

    el.value = Number.NaN;
    await el.updateComplete;
    expect(track?.getAttribute('aria-valuenow')).toBe('0');
    expect(fill?.style.width).toBe('0%');
  });

  it('sets standard ARIA attributes', async () => {
    const el = await fixture<KProgressBar>(
      html`<k-progress-bar
        .value="${50}"
        label="Download"></k-progress-bar>`,
    );
    const track = el.shadowRoot?.querySelector('[role="progressbar"]');

    expect(track?.getAttribute('role')).toBe('progressbar');
    expect(track?.getAttribute('aria-valuemin')).toBe('0');
    expect(track?.getAttribute('aria-valuemax')).toBe('100');
    expect(track?.getAttribute('aria-valuenow')).toBe('50');
    expect(track?.getAttribute('aria-label')).toBe('Download');
  });

  it('omits aria-valuenow and applies indeterminate style when indeterminate', async () => {
    const el = await fixture<KProgressBar>(
      html`<k-progress-bar
        indeterminate
        .value="${30}"></k-progress-bar>`,
    );
    const track = el.shadowRoot?.querySelector('[role="progressbar"]');
    const fill = el.shadowRoot?.querySelector('.fill') as HTMLElement;

    expect(el.hasAttribute('indeterminate')).toBe(true);
    expect(track?.hasAttribute('aria-valuenow')).toBe(false);
    expect(fill?.style.width).toBe('');

    el.indeterminate = false;
    await el.updateComplete;
    expect(el.hasAttribute('indeterminate')).toBe(false);
    expect(track?.getAttribute('aria-valuenow')).toBe('30');
    expect(fill?.style.width).toBe('30%');
  });

  it('renders label from property or slot', async () => {
    const el = await fixture<KProgressBar>(
      html`<k-progress-bar
        .value="${38}"
        label="38%"></k-progress-bar>`,
    );
    const labelEl = el.shadowRoot?.querySelector('.label');
    expect(labelEl?.textContent?.trim()).toBe('38%');

    const slottedEl = await fixture<KProgressBar>(
      html`<k-progress-bar .value="${75}"
        ><span class="custom">Loading...</span></k-progress-bar
      >`,
    );
    const slot = slottedEl.shadowRoot?.querySelector('slot');
    expect(slot).toBeTruthy();
  });
});
