import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VoicePeerComponent } from './voice-peer.component';

describe('VoicePeerComponent', () => {
  let component: VoicePeerComponent;
  let fixture: ComponentFixture<VoicePeerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VoicePeerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VoicePeerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
