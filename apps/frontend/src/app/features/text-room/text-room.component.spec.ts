import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextRoomComponent } from './text-room.component';
import { TextRoomStore } from './text-room.store';
import { ActivatedRoute } from '@angular/router';
import { Component } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
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
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [TextRoomComponent],
      providers: [
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
});
