import { describe, expect, it } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-field';
import type { KField } from './k-field';

describe('k-field', () => {
  it('renders label and slotted content', async () => {
    const el = await fixture<KField>(html`
      <k-field label="Server URL">
        <input
          id="test-input"
          type="text" />
      </k-field>
    `);

    const label = el.shadowRoot?.querySelector('.label-wrapper');
    expect(label?.textContent).toContain('Server URL');
    const input = el.querySelector('input');
    expect(input).not.toBeNull();
  });

  it('links slotted control with aria-describedby for hint and error', async () => {
    const el = await fixture<KField>(html`
      <k-field
        label="URL"
        hint="Enter valid URL"
        error="Invalid URL">
        <input
          id="test-input"
          type="text" />
      </k-field>
    `);

    const input = el.querySelector('input');
    const describedBy = input?.getAttribute('aria-describedby');
    expect(describedBy).toContain(el.errorId);
    expect(describedBy).toContain(el.hintId);

    const errorEl = el.shadowRoot?.querySelector('.error');
    expect(errorEl?.getAttribute('role')).toBe('alert');
    expect(errorEl?.textContent?.trim()).toBe('Invalid URL');
  });

  it('updates aria-describedby when error or hint changes', async () => {
    const el = await fixture<KField>(html`
      <k-field
        label="URL"
        hint="Hint text">
        <input type="text" />
      </k-field>
    `);

    const input = el.querySelector('input');
    expect(input?.getAttribute('aria-describedby')).toBe(el.hintId);

    el.error = 'Something broke';
    await el.updateComplete;

    expect(input?.getAttribute('aria-describedby')).toContain(el.errorId);
    expect(input?.getAttribute('aria-describedby')).toContain(el.hintId);

    el.error = '';
    el.hint = '';
    await el.updateComplete;

    expect(input?.getAttribute('aria-describedby')).toBeNull();
  });
});
