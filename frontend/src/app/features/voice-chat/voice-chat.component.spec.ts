import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoiceChatComponent } from './voice-chat.component';

describe('VoiceChatComponent', () => {
  let component: VoiceChatComponent;
  let fixture: ComponentFixture<VoiceChatComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceChatComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VoiceChatComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
