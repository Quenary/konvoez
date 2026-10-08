import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomComponent } from './text-room.component';
import { ChatStore } from '@shared/components/chat/chat.store';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { Component, input, signal } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideTranslateService } from '@ngx-translate/core';
import { RoomManageService } from '@features/rooms/room-manage.service';
import { RoomsStore } from '@core/stores/rooms.store';
import { ChatComponent } from '@shared/components/chat/chat.component';
import { IRoom } from '@konvoez/shared';

@Component({ selector: 'app-chat', template: '<ng-content />' })
class MockChatComponent {
  public readonly roomId = input<number | null>(null);
  public readonly recipientId = input<number | null>(null);
  public readonly title = input.required<string>();
  public readonly avatarUrl = input<string | null>(null);
}

describe('TextRoomComponent', () => {
  let component: TextRoomComponent;
  let fixture: ComponentFixture<TextRoomComponent>;
  let paramMap$: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let routerNavigate: ReturnType<typeof vi.fn>;
  let roomsDictSignal: ReturnType<typeof signal<Record<number, IRoom>>>;

  const mockChatStore = {
    join: vi.fn(),
    leave: vi.fn(),
    isSearchOpen: vi.fn().mockReturnValue(false),
    setSearchQuery: vi.fn(),
    setSearchOpen: vi.fn(),
    clearSearch: vi.fn(),
  };

  const mockRoomManageService = {
    canManageRooms: signal(false),
    editRoom: vi.fn(),
    deleteRoom: vi.fn(),
  };

  let mockRoomsStore: {
    loadOne: ReturnType<typeof vi.fn>;
    roomsDict: ReturnType<typeof signal<Record<number, IRoom>>>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    paramMap$ = new BehaviorSubject(convertToParamMap({ id: '42' }));
    routerNavigate = vi.fn().mockResolvedValue(true);
    roomsDictSignal = signal<Record<number, IRoom>>({
      42: { id: 42, name: 'General', avatarUrl: null } as IRoom,
    });
    mockRoomsStore = {
      loadOne: vi.fn(),
      roomsDict: roomsDictSignal,
    };

    await TestBed.configureTestingModule({
      imports: [TextRoomComponent],
      providers: [
        provideTranslateService(),
        { provide: Router, useValue: { navigate: routerNavigate } },
        { provide: RoomsStore, useValue: mockRoomsStore },
        { provide: ChatStore, useValue: mockChatStore },
        { provide: RoomManageService, useValue: mockRoomManageService },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: paramMap$,
          },
        },
      ],
    })
      .overrideComponent(TextRoomComponent, {
        remove: { imports: [ChatComponent] },
        add: { imports: [MockChatComponent] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(TextRoomComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose room id from route', () => {
    expect(component['roomId']()).toBe(42);
  });

  it('should resolve room title from store', () => {
    expect(component['title']()).toBe('General');
  });

  it('should load one on valid id', () => {
    expect(mockRoomsStore.loadOne).toHaveBeenCalledWith(42);
  });

  it('does not load one when id is negative or non-numeric', () => {
    vi.clearAllMocks();
    paramMap$.next(convertToParamMap({ id: '-1' }));
    fixture.detectChanges();
    expect(mockRoomsStore.loadOne).not.toHaveBeenCalled();

    paramMap$.next(convertToParamMap({ id: 'invalid' }));
    fixture.detectChanges();
    expect(mockRoomsStore.loadOne).not.toHaveBeenCalled();
  });

  it('navigates home when the viewed room is removed from RoomsStore', async () => {
    expect(routerNavigate).not.toHaveBeenCalled();

    roomsDictSignal.set({});
    fixture.detectChanges();
    await fixture.whenStable();

    expect(routerNavigate).toHaveBeenCalledWith(['/']);
  });

  it('does not navigate home while the room is still loading', async () => {
    routerNavigate.mockClear();
    roomsDictSignal.set({});

    paramMap$.next(convertToParamMap({ id: '99' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(routerNavigate).not.toHaveBeenCalled();
  });
});
