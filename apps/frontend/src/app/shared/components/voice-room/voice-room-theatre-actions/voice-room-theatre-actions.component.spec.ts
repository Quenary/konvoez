import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoomViewService } from '../voice-room-view.service';
import { VoiceRoomTheatreActionsComponent } from './voice-room-theatre-actions.component';

describe('VoiceRoomTheatreActionsComponent', () => {
  let toggleFullscreen: ReturnType<typeof vi.fn>;
  let closeTheatre: ReturnType<typeof vi.fn>;
  let isFullscreen: ReturnType<typeof signal<boolean>>;

  beforeEach(() => {
    toggleFullscreen = vi.fn().mockResolvedValue(undefined);
    closeTheatre = vi.fn();
    isFullscreen = signal(false);

    TestBed.configureTestingModule({
      imports: [VoiceRoomTheatreActionsComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceRoomViewService,
          useValue: {
            isFullscreen: isFullscreen.asReadonly(),
            toggleFullscreen,
            closeTheatre,
          },
        },
      ],
    });
  });

  it('toggles fullscreen on the given element and closes theatre', () => {
    const fixture = TestBed.createComponent(VoiceRoomTheatreActionsComponent);
    const target = document.createElement('div');
    fixture.componentRef.setInput('fullscreenTarget', target);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons[0]?.click();
    buttons[1]?.click();

    expect(toggleFullscreen).toHaveBeenCalledWith(target);
    expect(closeTheatre).toHaveBeenCalledTimes(1);
  });

  it('hides close when the stage owns that action', () => {
    const fixture = TestBed.createComponent(VoiceRoomTheatreActionsComponent);
    fixture.componentRef.setInput('showClose', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelectorAll('button').length).toBe(1);
  });
});
