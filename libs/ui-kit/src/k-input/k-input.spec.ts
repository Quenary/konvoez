import { describe, expect, it, vi } from 'vitest';
import { html } from 'lit';
import { fixture } from '../testing/fixture';
import './k-input';
import type { KInput } from './k-input';

describe('k-input', () => {
  it('renders label with for attribute matching input id', async () => {
    const el = await fixture<KInput>(html`
      <k-input
        label="Server address"
        placeholder="https://..."></k-input>
    `);

    const label = el.shadowRoot?.querySelector('label');
    const input = el.shadowRoot?.querySelector('input');
    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
    expect(label?.getAttribute('for')).toBe(input?.id);
    expect(input?.id).toBe(el.inputId);
  });

  it('typing emits k-input with value', async () => {
    const el = await fixture<KInput>(html` <k-input></k-input> `);

    const onInput = vi.fn();
    el.addEventListener('k-input', onInput);

    const input = el.shadowRoot?.querySelector('input');
    if (!input) throw new Error('Input not found');

    input.value = 'hello';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onInput).toHaveBeenCalledTimes(1);
    expect(onInput.mock.calls[0][0].detail).toEqual({ value: 'hello' });
    expect(el.value).toBe('hello');
  });

  it('blur emits k-change with value', async () => {
    const el = await fixture<KInput>(html`
      <k-input value="initial"></k-input>
    `);

    const onChange = vi.fn();
    el.addEventListener('k-change', onChange);

    const input = el.shadowRoot?.querySelector('input');
    input?.dispatchEvent(new Event('blur'));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].detail).toEqual({ value: 'initial' });
  });

  it('Enter emits k-enter and k-change', async () => {
    const el = await fixture<KInput>(html` <k-input value="test"></k-input> `);

    const onEnter = vi.fn();
    const onChange = vi.fn();
    el.addEventListener('k-enter', onEnter);
    el.addEventListener('k-change', onChange);

    const input = el.shadowRoot?.querySelector('input');
    input?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );

    expect(onEnter).toHaveBeenCalledTimes(1);
    expect(onEnter.mock.calls[0][0].detail).toEqual({ value: 'test' });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('error sets aria-invalid="true" and aria-describedby links hint and error', async () => {
    const el = await fixture<KInput>(html`
      <k-input
        label="URL"
        hint="Example: https://example.com"
        error="Invalid URL"></k-input>
    `);

    const input = el.shadowRoot?.querySelector('input');
    expect(input?.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input?.getAttribute('aria-describedby');
    expect(describedBy).toContain(el.errorId);
    expect(describedBy).toContain(el.hintId);

    const errorEl = el.shadowRoot?.querySelector('.error');
    expect(errorEl?.getAttribute('role')).toBe('alert');
  });
});
