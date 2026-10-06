import { Directive, inject, TemplateRef } from '@angular/core';

@Directive({
  selector: 'ng-template[appVoiceOverlay]',
})
export class VoiceOverlaySlotDirective {
  readonly template = inject(TemplateRef<void>);
}
