import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomComponent } from './text-room.component';
import { TextRoomStore } from './text-room.store';
import { ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { provideMockStore } from '@ngrx/store/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TextRoomEditorComponent } from './text-room-editor/text-room-editor.component';
import { TextRoomListComponent } from './text-room-list/text-room-list.component';

@Component({ selector: 'app-text-room-editor', template: '' })
class MockEditorComponent {}

@Component({ selector: 'app-text-room-list', template: '' })
class MockListComponent {}

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

  beforeEach(async () => {
    vi.clearAllMocks();

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
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ id: '42' }),
          },
        },
      ],
    })
      .overrideComponent(TextRoomComponent, {
        remove: { imports: [TextRoomEditorComponent, TextRoomListComponent] },
        add: { imports: [MockEditorComponent, MockListComponent] },
      })
      .compileComponents();

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
    (
      component as unknown as {
        searchControl: { setValue: (v: string) => void };
      }
    ).searchControl.setValue('hello');
    expect(mockTextRoomStore.setSearchQuery).not.toHaveBeenCalled();

    vi.advanceTimersByTime(350);
    expect(mockTextRoomStore.setSearchQuery).toHaveBeenCalledWith('hello');
    vi.useRealTimers();
  });

  it('should toggle search visibility when toggleSearch is called', () => {
    const comp = component as unknown as {
      toggleSearch: () => void;
    };
    mockTextRoomStore.isSearchOpen.mockReturnValue(false);
    comp.toggleSearch();
    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(true);

    mockTextRoomStore.isSearchOpen.mockReturnValue(true);
    comp.toggleSearch();
    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(false);
  });

  it('should handle onSearchOpenChange and reset control when closed', () => {
    const comp = component as unknown as {
      searchControl: { value: string; setValue: (v: string) => void };
      onSearchOpenChange: (open: boolean) => void;
    };
    comp.searchControl.setValue('test');
    comp.onSearchOpenChange(false);

    expect(mockTextRoomStore.setSearchOpen).toHaveBeenCalledWith(false);
    expect(comp.searchControl.value).toBe('');
  });

  it('should clear search input and call store.clearSearch', () => {
    const comp = component as unknown as {
      searchControl: { value: string; setValue: (v: string) => void };
      clearSearch: () => void;
    };
    comp.searchControl.setValue('test');
    comp.clearSearch();

    expect(comp.searchControl.value).toBe('');
    expect(mockTextRoomStore.clearSearch).toHaveBeenCalled();
  });

  it('should leave room on destroy', () => {
    fixture.destroy();
    expect(mockTextRoomStore.leave).toHaveBeenCalled();
  });
});
