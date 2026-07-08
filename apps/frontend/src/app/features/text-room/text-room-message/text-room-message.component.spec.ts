import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextRoomMessageComponent } from './text-room-message.component';

describe('TextRoomMessageComponent', () => {
  let component: TextRoomMessageComponent;
  let fixture: ComponentFixture<TextRoomMessageComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextRoomMessageComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextRoomMessageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
