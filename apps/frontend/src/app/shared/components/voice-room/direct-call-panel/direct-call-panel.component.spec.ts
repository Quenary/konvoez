import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceLeaveService } from '@core/services/voice-leave.service';
import { VoiceSessionPeersService } from '../voice-session-peers.service';
import { DirectCallPanelComponent } from './direct-call-panel.component';

describe('DirectCallPanelComponent', () => {
  let leaveActiveVoice: ReturnType<typeof vi.fn>;
  let count: ReturnType<typeof signal<number>>;

  beforeEach(() => {
    leaveActiveVoice = vi.fn().mockResolvedValue(undefined);
    count = signal(2);

    TestBed.configureTestingModule({
      imports: [DirectCallPanelComponent],
      providers: [
        provideTranslateService(),
        {
          provide: VoiceLeaveService,
          useValue: { leaveActiveVoice },
        },
        {
          provide: VoiceSessionPeersService,
          useValue: {
            count: count.asReadonly(),
            peers: signal([]).asReadonly(),
          },
        },
      ],
    });
    TestBed.overrideComponent(DirectCallPanelComponent, {
      set: {
        imports: [],
        template: `
          <p class="count">{{ participantsCount() }}</p>
          <button type="button" (click)="onHangup()">hangup</button>
        `,
      },
    });
  });

  it('shows the shared participant count and hangs up', () => {
    const fixture = TestBed.createComponent(DirectCallPanelComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('.count')?.textContent?.trim(),
    ).toBe('2');

    count.set(4);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('.count')?.textContent?.trim(),
    ).toBe('4');

    (
      fixture.nativeElement.querySelector('button') as HTMLButtonElement
    ).click();
    expect(leaveActiveVoice).toHaveBeenCalledTimes(1);
  });
});
