import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatComponent } from './chat.component';
import { ChatStore } from './chat.store';
import type { ChatTarget } from './chat-target';

describe('ChatComponent', () => {
  let fixture: ComponentFixture<ChatComponent>;
  let join: ReturnType<typeof vi.fn>;
  let leave: ReturnType<typeof vi.fn>;
  let target: ReturnType<typeof signal<ChatTarget | null>>;

  beforeEach(async () => {
    join = vi.fn();
    leave = vi.fn();
    target = signal<ChatTarget | null>(null);

    const chatStoreMock = {
      target,
      join,
      leave,
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
          template: '',
          imports: [],
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
});
