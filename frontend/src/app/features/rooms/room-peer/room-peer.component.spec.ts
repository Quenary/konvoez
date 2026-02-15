import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoomPeerComponent } from './room-peer.component';

describe('RoomPeerComponent', () => {
  let component: RoomPeerComponent;
  let fixture: ComponentFixture<RoomPeerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoomPeerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoomPeerComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
