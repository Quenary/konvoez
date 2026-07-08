import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoiceRoomPanelComponent } from './voice-room-panel.component';

describe('VoiceRoomPanelComponent', () => {
  let component: VoiceRoomPanelComponent;
  let fixture: ComponentFixture<VoiceRoomPanelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoiceRoomPanelComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VoiceRoomPanelComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
