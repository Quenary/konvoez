import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextRoomListComponent } from './text-room-list.component';

describe('TextRoomListComponent', () => {
  let component: TextRoomListComponent;
  let fixture: ComponentFixture<TextRoomListComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextRoomListComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextRoomListComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
