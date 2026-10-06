import { TestBed } from '@angular/core/testing';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TextRoomSocketToken } from '@core/tokens/text-room-socket.token';
import { selectIsAuthorized } from '@features/auth/auth.selectors';
import { TextRoomSocketConnectionService } from './text-room-socket-connection.service';

describe('TextRoomSocketConnectionService', () => {
  let store: MockStore;
  let socket: {
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    socket = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideMockStore({
          selectors: [{ selector: selectIsAuthorized, value: false }],
        }),
        { provide: TextRoomSocketToken, useValue: socket },
        TextRoomSocketConnectionService,
      ],
    });

    store = TestBed.inject(MockStore);
  });

  afterEach(() => {
    store.resetSelectors();
  });

  it('connects when authorized and disconnects when not', () => {
    TestBed.inject(TextRoomSocketConnectionService);
    expect(socket.connect).not.toHaveBeenCalled();

    store.overrideSelector(selectIsAuthorized, true);
    store.refreshState();
    expect(socket.connect).toHaveBeenCalledTimes(1);

    store.overrideSelector(selectIsAuthorized, false);
    store.refreshState();
    expect(socket.disconnect).toHaveBeenCalled();
  });
});
