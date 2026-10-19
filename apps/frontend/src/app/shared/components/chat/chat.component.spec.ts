import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TuiBadgeNotification } from '@taiga-ui/kit';
import { ChatComponent } from './chat.component';
import { ChatStore } from './chat.store';
import type { ChatTarget } from './chat-target';

describe('ChatComponent', () => {
  let fixture: ComponentFixture<ChatComponent>;
  let join: ReturnType<typeof vi.fn>;
  let leave: ReturnType<typeof vi.fn>;
  let jumpToMessage: ReturnType<typeof vi.fn>;
  let target: ReturnType<typeof signal<ChatTarget | null>>;

  beforeEach(async () => {
    join = vi.fn();
    leave = vi.fn();
    jumpToMessage = vi.fn();
    target = signal<ChatTarget | null>(null);

    const chatStoreMock = {
      target,
      join,
      leave,
      jumpToMessage,
      isSearchOpen: signal(false).asReadonly(),
      setSearchQuery: vi.fn(),
      setSearchOpen: vi.fn(),
      clearSearch: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ChatComponent],
      providers: [provideTranslateService()],
    })
      .overrideComponent(ChatComponent, {
        set: {
          template: `
            @if (isOnline()) {
              <tui-badge-notification class="online-badge" />
            }
          `,
          imports: [TuiBadgeNotification],
          providers: [{ provide: ChatStore, useValue: chatStoreMock }],
        },
      })
      .compileComponents();
  });

  const mountRoom = (id: number) => {
    fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('roomId', id);
    fixture.componentRef.setInput('title', 'room');
    fixture.detectChanges();
  };

  it('joins the initial room target', () => {
    mountRoom(1);
    expect(join).toHaveBeenCalledWith({ kind: 'room', id: 1 });
    expect(leave).not.toHaveBeenCalled();
  });

  it('leaves the previous chat before joining another target', () => {
    mountRoom(1);
    join.mockClear();
    leave.mockClear();
    target.set({ kind: 'room', id: 1 });

    fixture.componentRef.setInput('roomId', 2);
    fixture.detectChanges();

    expect(leave).toHaveBeenCalledTimes(1);
    expect(join).toHaveBeenCalledWith({ kind: 'room', id: 2 });
  });

  it('leaves when the target inputs are cleared', () => {
    mountRoom(1);
    const joinCallsAfterMount = join.mock.calls.length;
    leave.mockClear();
    target.set({ kind: 'room', id: 1 });

    fixture.componentRef.setInput('roomId', null);
    fixture.detectChanges();

    expect(leave).toHaveBeenCalledTimes(1);
    expect(join.mock.calls.length).toBe(joinCallsAfterMount);
  });

  it('accepts isOnline input and renders online badge', () => {
    fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('roomId', 1);
    fixture.componentRef.setInput('title', 'room');
    fixture.componentRef.setInput('isOnline', true);
    fixture.detectChanges();

    expect(fixture.componentInstance.isOnline()).toBe(true);
    expect(fixture.nativeElement.querySelector('.online-badge')).toBeTruthy();

    fixture.componentRef.setInput('isOnline', false);
    fixture.detectChanges();
    expect(fixture.componentInstance.isOnline()).toBe(false);
    expect(fixture.nativeElement.querySelector('.online-badge')).toBeNull();
  });

  it('passes initialMessageId to join when initialMessageId input is provided', () => {
    fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('roomId', 1);
    fixture.componentRef.setInput('title', 'room');
    fixture.componentRef.setInput('initialMessageId', 'msg-target-1');
    fixture.detectChanges();

    expect(join).toHaveBeenCalledWith({ kind: 'room', id: 1 }, 'msg-target-1');
  });

  it('triggers jumpToMessage when initialMessageId changes while already joined', () => {
    target.set({ kind: 'room', id: 1 });
    fixture = TestBed.createComponent(ChatComponent);
    fixture.componentRef.setInput('roomId', 1);
    fixture.componentRef.setInput('title', 'room');
    fixture.detectChanges();

    fixture.componentRef.setInput('initialMessageId', 'msg-target-dynamic');
    fixture.detectChanges();

    expect(jumpToMessage).toHaveBeenCalledWith('msg-target-dynamic');
  });
});
