import { describe, expect, it, vi, afterEach } from 'vitest';
import { html } from 'lit';
import { fixture, cleanupFixtures } from '../testing/fixture';
import './k-button';
import type { KButton } from './k-button';

describe('k-button', () => {
  afterEach(() => {
    cleanupFixtures();
  });

  it('click emits k-click event', async () => {
    const el = await fixture<KButton>(html`<k-button>Click me</k-button>`);
    const clickSpy = vi.fn();
    el.addEventListener('k-click', clickSpy);

    const button = el.shadowRoot?.querySelector('button');
    button?.click();

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('disabled suppresses k-click event', async () => {
    const el = await fixture<KButton>(
      html`<k-button disabled>Click me</k-button>`,
    );
    const clickSpy = vi.fn();
    el.addEventListener('k-click', clickSpy);

    const button = el.shadowRoot?.querySelector('button');
    button?.click();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(button?.hasAttribute('disabled')).toBe(true);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
  });

  it('loading suppresses k-click and sets aria-busy', async () => {
    const el = await fixture<KButton>(
      html`<k-button loading>Loading</k-button>`,
    );
    const clickSpy = vi.fn();
    el.addEventListener('k-click', clickSpy);

    const button = el.shadowRoot?.querySelector('button');
    button?.click();

    expect(clickSpy).not.toHaveBeenCalled();
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(el.shadowRoot?.querySelector('k-spinner')).toBeTruthy();
  });

  it('reflects variant property to attribute', async () => {
    const el = await fixture<KButton>(
      html`<k-button variant="danger">Delete</k-button>`,
    );
    expect(el.getAttribute('variant')).toBe('danger');

    el.variant = 'secondary';
    await el.updateComplete;
    expect(el.getAttribute('variant')).toBe('secondary');
  });
});
