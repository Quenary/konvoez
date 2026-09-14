import {
  inject,
  Pipe,
  PipeTransform,
  Sanitizer,
  SecurityContext,
} from '@angular/core';

@Pipe({
  name: 'textContent',
})
export class TextContentPipe implements PipeTransform {
  private readonly sanitizer = inject(Sanitizer);

  transform(html: string | null | undefined): string {
    if (!html) {
      return '';
    }

    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, html) ?? '';
    if (!sanitized) {
      return '';
    }

    if (typeof DOMParser !== 'undefined') {
      const doc = new DOMParser().parseFromString(sanitized, 'text/html');
      return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
    }

    return sanitized
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
