import { Directive, inject, TemplateRef } from '@angular/core';
import type { TVoiceRoomTile } from './voice-room-tiles';

export type TVoiceOverlayContext = {
  $implicit: TVoiceRoomTile | null;
};

@Directive({
  selector: 'ng-template[appVoiceOverlay]',
})
export class VoiceOverlaySlotDirective {
  public readonly template = inject(TemplateRef<TVoiceOverlayContext>);
}
