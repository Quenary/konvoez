import type { LitElement, TemplateResult } from 'lit';
import { render } from 'lit';

export async function fixture<T extends HTMLElement>(
  template: TemplateResult,
): Promise<T> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(template, container);
  const element = container.firstElementChild as T;
  if ('updateComplete' in element) {
    await (element as unknown as LitElement).updateComplete;
  }
  return element;
}

export function cleanupFixtures(): void {
  document.body.innerHTML = '';
}
