import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SettingsDevicesComponent } from './settings-devices.component';

describe('SettingsDevicesComponent', () => {
  let component: SettingsDevicesComponent;
  let fixture: ComponentFixture<SettingsDevicesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsDevicesComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SettingsDevicesComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
