import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TextChatComponent } from './text-chat.component';

describe('TextChatComponent', () => {
  let component: TextChatComponent;
  let fixture: ComponentFixture<TextChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TextChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TextChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
