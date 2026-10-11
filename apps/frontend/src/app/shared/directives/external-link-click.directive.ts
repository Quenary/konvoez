import { Directive, inject } from '@angular/core';
import { ExternalLinkService } from '@core/services/external-link.service';

@Directive({
  selector: '[appExternalLinkClick]',
  host: {
    '(click)': 'onClick($event)',
  },
})
export class ExternalLinkClickDirective {
  private readonly externalLinkService = inject(ExternalLinkService);

  protected onClick(event: MouseEvent): void {
    this.externalLinkService.handleHtmlContentClick(event, {
      root:
        event.currentTarget instanceof HTMLElement ? event.currentTarget : null,
    });
  }
}
