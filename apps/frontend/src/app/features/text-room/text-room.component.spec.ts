import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomComponent } from './text-room.component';
import { TextRoomStore } from './text-room.store';
import { ActivatedRoute } from '@angular/router';
import { Component, signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { UsersStore } from '@features/users/users.store';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';
import { DirectCallPanelComponent } from '@shared/components/voice-room/direct-call-panel/direct-call-panel.component';
import { DirectCallService } from '@core/services/direct-call.service';
import { VoiceRoomStore } from '@features/voice-room/voice-room.store';
import { RoomManageService } from '@features/rooms/room-manage.service';

@Component({ selector: 'app-text-room-editor', template: '' })
class MockEditorComponent {}

@Component({ selector: 'app-text-room-list', template: '' })
class MockListComponent {}

@Component({ selector: 'app-direct-call-panel', template: '' })
class MockDirectCallPanelComponent {}

describe('TextRoomComponent', () => {
  let component: TextRoomComponent;
  let fixture: ComponentFixture<TextRoomComponent>;

  const mockTextRoomStore = {
    join: vi.fn(),
    leave: vi.fn(),
    isSearchOpen: vi.fn().mockReturnValue(false),
    setSearchQuery: vi.fn(),
    setSearchOpen: vi.fn(),
    clearSearch: vi.fn(),
  };

  const mockUsersStore = {
    loadAll: vi.fn(),
    entityMap: vi.fn().mockReturnValue({}),
    entities: vi.fn().mockReturnValue([]),
  };

  const mockDirectCallService = {
    activeSession: signal(null),
    interlocutor: signal(null),
    isCallActive: signal(false),
    rejoinableCall: signal(null),
    initiateCall: vi.fn(),
    rejoinCall: vi.fn(),
    refreshActiveCall: vi.fn().mockResolvedValue(null),
  };

  const mockVoiceRoomStore = {
    activeSession: signal(null),
    peersList: signal([]),
  };

  const mockRoomManageService = {
    canManageRooms: signal(false),
    editRoom: vi.fn(),
    deleteRoom: vi.fn(),
  };

  const configure = async (route: { params: unknown; data: unknown }) => {
    await TestBed.configureTestingModule({
      imports: [TextRoomComponent],
      providers: [
        provideMockStore({
          initialState: {
            rooms: {
              selectedRoomId: 42,
              entities: {
                42: { id: 42, name: 'General' },
              },
              ids: [42],
            },
          },
        }),
        provideTranslateService(),
        { provide: TextRoomStore, useValue: mockTextRoomStore },
        { provide: UsersStore, useValue: mockUsersStore },
        { provide: DirectCallService, useValue: mockDirectCallService },
        { provide: VoiceRoomStore, useValue: mockVoiceRoomStore },
        { provide: RoomManageService, useValue: mockRoomManageService },
        { provide: ActivatedRoute, useValue: route },
      ],
    })
      .overrideComponent(TextRoomComponent, {
        remove: {
          imports: [
            TextRoomEditorComponent,
            TextRoomListComponent,
            DirectCallPanelComponent,
          ],
        },
        add: {
          imports: [
            MockEditorComponent,
            MockListComponent,
            MockDirectCallPanelComponent,
          ],
        },
      })
      .compileComponents();
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await configure({
      params: of({ id: '42' }),
      data: of({ isDirect: false }),
    });

    fixture = TestBed.createComponent(TextRoomComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should join text room with parsed id on init', () => {
    expect(mockTextRoomStore.join).toHaveBeenCalledWith({
      roomId: 42,
      recipientId: null,
    });
  });

  it('should update search query with debounce when search input changes', () => {
    vi.useFakeTimers();
    component['searchControl'].setValue('hello');
    expect(mockTextRoomStore.setSearchQuery).not.toHaveBeenCalled();

    vi.advanceTimersByTime(350);
    expect(mockTextRoomStore.setSearchQuery).toHaveBeenCalledWith('hello');
    vi.useRealTimers();
  });

  it('should toggle search visibility when toggleSearch is called', () => {
    mockTextRoomStore.isSearchOpen.mockReturnValue(false);
    component['toggleSearch']();
    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(true);

    mockTextRoomStore.isSearchOpen.mockReturnValue(true);
    component['toggleSearch']();
    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('should handle onSearchOpenChange and reset control when closed', () => {
    component['searchControl'].setValue('test');
    component['onSearchOpenChange'](false);

    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(false);
    expect(component['searchControl'].value).toBe('');
  });

  it('should clear search input and call store.clearSearch', () => {
    component['searchControl'].setValue('test');
    component['clearSearch']();

    expect(component['searchControl'].value).toBe('');
    expect(mockTextRoomStore.clearSearch).toHaveBeenCalled();
  });

  it('should leave room on destroy', () => {
    fixture.destroy();
    expect(mockTextRoomStore.leave).toHaveBeenCalled();
  });

  describe('direct chat mode', () => {
    beforeEach(async () => {
      TestBed.resetTestingModule();
      await configure({
        params: of({ id: '99' }),
        data: of({ isDirect: true }),
      });
    });

    it('should join direct chat with recipientId when isDirect is true', async () => {
      const directFixture = TestBed.createComponent(TextRoomComponent);
      await directFixture.whenStable();

      expect(mockTextRoomStore.join).toHaveBeenCalledWith({
        roomId: null,
        recipientId: 99,
      });
      expect(mockDirectCallService.refreshActiveCall).toHaveBeenCalledWith(99);
    });
  });
});
