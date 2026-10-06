import { Directive, inject, TemplateRef } from '@angular/core';

@Directive({
  selector: 'ng-template[appVoiceOverlay]',
})
export class VoiceOverlaySlotDirective {
  public readonly template = inject(TemplateRef<void>);
}
