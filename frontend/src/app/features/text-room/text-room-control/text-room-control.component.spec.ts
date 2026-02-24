import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextRoomControlComponent } from './text-room-control.component';

describe('TextRoomControlComponent', () => {
  let component: TextRoomControlComponent;
  let fixture: ComponentFixture<TextRoomControlComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextRoomControlComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextRoomControlComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
